import { describe, expect, it } from 'vitest';
import { parseRoute } from './route';
import { loadCourse } from '@/test/node-host';

const { course } = loadCourse();

describe('parseRoute keeps the original deep links', () => {
  it('resolves home, module, lesson and checkpoint hashes', () => {
    expect(parseRoute(course, '').kind).toBe('home');
    expect(parseRoute(course, '#home').kind).toBe('home');
    expect(parseRoute(course, '#m02')).toMatchObject({ kind: 'module', hash: 'm02' });
    expect(parseRoute(course, '#m02-l3')).toMatchObject({ kind: 'lesson', idx: 2 });
    expect(parseRoute(course, '#m10b-l1')).toMatchObject({ kind: 'lesson', idx: 0 });
    expect(parseRoute(course, '#m01-cp').kind).toBe('checkpoint');
  });
  it('every lesson id in the course is reachable', () => {
    for (const m of course.modules) m.lessons.forEach((L, i) => expect(parseRoute(course, '#' + L.id)).toMatchObject({ kind: 'lesson', idx: i }));
  });
  it('unknown hashes fall back like the original', () => {
    expect(parseRoute(course, '#nope').kind).toBe('home');
    expect(parseRoute(course, '#m02-l99')).toMatchObject({ kind: 'module', hash: 'm02' });
  });
});
