// The list of courses (public/courses/index.json). Each course lives in public/courses/<id>/ with a
// course.json and the dataset.json its practice database is built from. To add a course, add a folder
// and an entry here; the app, progress and accounts need no code changes.

export interface CourseMeta {
  /** Folder name and progress key; lowercase letters, digits and dashes. */
  id: string;
  title: string;
  /** Small label above the title on the course home page. */
  eyebrow: string;
  /** Label at the top of the sidebar. */
  brand: string;
  /** Used in browser tab titles. */
  shortTitle: string;
  /** One or two sentences for the catalogue card. */
  summary: string;
  /** Intro paragraph on the course home page. */
  lead: string;
  pace?: string;
  /** Number of modules, shown on the catalogue card (checked against course.json by the tests). */
  modules?: number;
  outcomes: string[];
  /** localStorage key of progress saved before accounts existed; imported once on first sign-in. */
  legacyStorageKey?: string;
}

export interface Catalog { courses: CourseMeta[] }

const ID = /^[a-z0-9-]{1,64}$/;

export function parseCatalog(data: unknown): Catalog {
  const list = (data as Catalog | null)?.courses;
  if (!Array.isArray(list) || !list.length) throw new Error('courses/index.json lists no courses.');
  for (const c of list) {
    if (!c || typeof c.id !== 'string' || !ID.test(c.id)) throw new Error(`courses/index.json has an invalid course id: ${JSON.stringify(c?.id)}.`);
    if (typeof c.title !== 'string' || !Array.isArray(c.outcomes)) throw new Error(`Course "${c.id}" in courses/index.json is missing a title or outcomes.`);
  }
  return { courses: list };
}

export const courseFile = (id: string, file: string) => `courses/${id}/${file}`;

/** The course in the address (?course=<id>), or null for the catalogue. */
export function selectedCourseId(search: string): string | null {
  return new URLSearchParams(search).get('course');
}

/** Address of a course, optionally at one of its hash routes. */
export function courseHref(id: string, hash = ''): string {
  return `?course=${encodeURIComponent(id)}${hash ? '#' + hash.replace(/^#/, '') : ''}`;
}
