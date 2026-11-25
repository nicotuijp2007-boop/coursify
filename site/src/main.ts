import "./style.css";
import type { Course } from "../shared/course.ts";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <header><h1>Coursify</h1><p>Type a topic. Get a short interactive course.</p></header>
  <form id="gen">
    <input name="topic" placeholder="e.g. How DNS works" maxlength="200" required />
    <select name="level">
      <option value="beginner">Beginner</option>
      <option value="intermediate">Intermediate</option>
      <option value="advanced">Advanced</option>
    </select>
    <button type="submit">Create course</button>
  </form>
  <p id="status" role="status"></p>
  <main id="course"></main>
`;

const form = document.querySelector<HTMLFormElement>("#gen")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;
const courseEl = document.querySelector<HTMLElement>("#course")!;

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  const button = form.querySelector("button")!;
  button.disabled = true;
  courseEl.innerHTML = "";
  status.textContent = "Writing your course… this can take a minute.";
  try {
    const res = await fetch("/api/generate-course", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "Something went wrong.");
    status.textContent = "";
    renderCourse(body.course as Course);
  } catch (err) {
    status.textContent = err instanceof Error ? err.message : String(err);
  } finally {
    button.disabled = false;
  }
});

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// Minimal Markdown: paragraphs, **bold**, `code`.
const md = (s: string) =>
  esc(s)
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`(.+?)`/g, "<code>$1</code>")}</p>`)
    .join("");

function renderCourse(course: Course) {
  courseEl.innerHTML = `
    <h2>${esc(course.title)}</h2>
    <p class="muted">${esc(course.level)} · ${course.lessons.length} lessons</p>
    <p>${esc(course.description)}</p>
    ${course.lessons
      .map(
        (l, li) => `
      <details class="lesson" ${li === 0 ? "open" : ""}>
        <summary><span>${li + 1}. ${esc(l.title)}</span><span class="score" data-lesson="${li}"></span></summary>
        <div class="body">${md(l.content)}</div>
        ${l.quiz
          .map(
            (q, qi) => `
          <fieldset class="q" data-lesson="${li}" data-q="${qi}">
            <legend>${esc(q.question)}</legend>
            ${q.options.map((o, oi) => `<button type="button" data-opt="${oi}">${esc(o)}</button>`).join("")}
            <p class="explain" hidden></p>
          </fieldset>`,
          )
          .join("")}
      </details>`,
      )
      .join("")}
  `;

  courseEl.querySelectorAll<HTMLFieldSetElement>("fieldset.q").forEach((fs) => {
    const lesson = course.lessons[Number(fs.dataset.lesson)];
    const q = lesson.quiz[Number(fs.dataset.q)];
    fs.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-opt]");
      if (!btn || fs.dataset.answered) return;
      fs.dataset.answered = "1";
      const right = Number(btn.dataset.opt) === q.correct_index;
      fs.querySelectorAll<HTMLButtonElement>("button").forEach((b, i) => {
        b.disabled = true;
        if (i === q.correct_index) b.classList.add("correct");
      });
      if (!right) btn.classList.add("wrong");
      fs.dataset.right = right ? "1" : "0";
      const ex = fs.querySelector<HTMLParagraphElement>(".explain")!;
      ex.textContent = `${right ? "Correct." : "Not quite."} ${q.explanation}`;
      ex.hidden = false;
      updateScore(fs.dataset.lesson!, lesson.quiz.length);
    });
  });
}

function updateScore(li: string, total: number) {
  const answered = courseEl.querySelectorAll(`fieldset.q[data-lesson="${li}"][data-answered]`);
  const right = [...answered].filter((f) => (f as HTMLElement).dataset.right === "1").length;
  courseEl.querySelector(`.score[data-lesson="${li}"]`)!.textContent =
    answered.length === total ? `${right}/${total} ✓` : `${answered.length}/${total}`;
}
