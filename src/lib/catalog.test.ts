import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCatalog } from './catalog';

const PUB = path.resolve(__dirname, '../../public');

describe('courses/index.json', () => {
  const catalog = parseCatalog(JSON.parse(fs.readFileSync(path.join(PUB, 'courses/index.json'), 'utf8')));
  it.each(catalog.courses.map(c => [c.id, c] as const))('%s has its files and a correct module count', (_id, c) => {
    const course = JSON.parse(fs.readFileSync(path.join(PUB, 'courses', c.id, 'course.json'), 'utf8'));
    expect(fs.existsSync(path.join(PUB, 'courses', c.id, 'dataset.json'))).toBe(true);
    if (c.modules !== undefined) expect(c.modules).toBe(course.modules.length);
  });
  it('rejects bad ids', () => {
    expect(() => parseCatalog({ courses: [{ id: 'Bad Id', title: 'x', outcomes: [] }] })).toThrow(/invalid course id/);
  });
});
