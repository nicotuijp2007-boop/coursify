import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { createClient } from "@supabase/supabase-js";
import type { Config } from "@netlify/functions";
import { Course } from "../../shared/course.ts";

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY

const SYSTEM = `You design short, interactive courses. Given a topic and level, write a course
whose lessons build on each other. Keep lesson text concrete, with examples. Quiz questions
must test understanding, not recall of wording, and have exactly one correct option.`;

export default async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const { topic, level = "beginner" } = (await req.json().catch(() => ({}))) as {
    topic?: string;
    level?: string;
  };
  if (!topic || topic.length > 200) {
    return Response.json({ error: "Provide a topic (max 200 characters)." }, { status: 400 });
  }

  try {
    const response = await anthropic.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: zodOutputFormat(Course) },
      system: SYSTEM,
      messages: [{ role: "user", content: `Topic: ${topic}\nLevel: ${level}` }],
    });

    if (response.stop_reason === "refusal") {
      return Response.json({ error: "This topic can't be turned into a course." }, { status: 422 });
    }
    const course = response.parsed_output;
    if (!course) return Response.json({ error: "Generation failed, try again." }, { status: 502 });

    const id = await saveCourse(topic, course);
    return Response.json({ id, course });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return Response.json({ error: "Busy, try again in a minute." }, { status: 429 });
    }
    if (err instanceof Anthropic.APIError) {
      console.error("Anthropic API error", err.status, err.message);
      return Response.json({ error: "Generation failed." }, { status: 502 });
    }
    throw err;
  }
};

// Saves to Supabase when configured; otherwise the course is only returned.
async function saveCourse(topic: string, course: Course): Promise<string | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await db.rpc("save_generated_course", { p_topic: topic, p_course: course });
  if (error) {
    console.error("Supabase save failed", error.message);
    return null;
  }
  return data as string;
}

export const config: Config = { path: "/api/generate-course" };
