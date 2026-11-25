import { z } from "zod";

export const QuizQuestion = z.object({
  question: z.string(),
  options: z.array(z.string()).describe("3-5 answer options"),
  correct_index: z.number().int().describe("0-based index into options"),
  explanation: z.string().describe("Why the correct answer is right"),
});

export const Lesson = z.object({
  title: z.string(),
  summary: z.string().describe("One sentence"),
  content: z.string().describe("Lesson body in Markdown, 150-400 words"),
  quiz: z.array(QuizQuestion).describe("2-4 questions testing this lesson"),
});

export const Course = z.object({
  title: z.string(),
  description: z.string(),
  level: z.enum(["beginner", "intermediate", "advanced"]),
  lessons: z.array(Lesson).describe("3-6 lessons, building on each other"),
});

export type Course = z.infer<typeof Course>;
