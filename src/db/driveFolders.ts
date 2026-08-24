import { SubjectId } from '../types';

/**
 * The Google Drive repository behind the app.
 *
 * Genie records where work lives; Drive holds the files. The link between them
 * has to be a folder URL rather than a path, for two reasons:
 *
 *  - A browser cannot open `file:///G:/...` from an https page, so the local
 *    Drive-for-Desktop path is useful to read but cannot be clicked.
 *  - Drive folder links are opaque IDs, not paths. There is no way to derive
 *    the Maths folder's URL from the parent folder's URL, which is why each
 *    subject carries its own rather than a base path plus a name.
 *
 * These are seeded defaults, not constants: every one is editable in the app
 * (Subjects & Goals -> a subject -> Edit Subject), so a folder that gets moved
 * or recreated can be repointed without a code change.
 *
 * Folder layout, created 24 August 2026:
 *   GCSEAppWorkingFolder/
 *     <Subject>/Notes  ·  <Subject>/Papers  ·  <Subject>/Practice
 *     _Shared-Resources/   _Genie-Backups/
 */

const folder = (id: string) => `https://drive.google.com/drive/folders/${id}`;

/** The folder every subject folder sits inside. */
export const WORKING_FOLDER_URL = folder('1RXeJ3lGqhTKk3BRCteSlweWmlpEM0NME');

/**
 * Where the same folder lives on a machine running Drive for Desktop. Shown so
 * files can be found in Explorer or Finder; deliberately not rendered as a
 * link, because it cannot be one.
 */
export const WORKING_FOLDER_PATH =
  'G:\\My Drive\\Documents\\UK\\Family\\Tejas\\GCSEAppWorkingFolder';

/** Genie's JSON exports belong here. */
export const BACKUPS_FOLDER_URL = folder('1VtiEfWFxEoLZFH1OUycXDBSQ2LCFXbkH');

/** Anything spanning subjects - revision planners, timetables. */
export const SHARED_RESOURCES_FOLDER_URL = folder('1YJvEyrvmPGnWKbi9RQiVilwwrQUNgU_C');

export const SUBJECT_DRIVE_FOLDERS: Record<SubjectId, string> = {
  maths: folder('1w2lk6lZlu3nCvHIk9tu9w9Ew6ZG5DBKs'),
  english_lang: folder('1JFfcjC3U9-F5AcilPLS9d3SX8kyYARVo'),
  english_lit: folder('1Dli9W-X2z-v8ltNOyxOUcY-ljOqyg8eA'),
  biology: folder('1h29noB-pLxQWszpE2nIS1qYHrDJ_3DAR'),
  chemistry: folder('1cR7W8ScdP85s02XTKyRopcLQXHUbrA3F'),
  physics: folder('1FGtCRYyn5wKprmBbKfMXtSrTqXGvO5Qa'),
  history: folder('1EBjHahVGZe2TodVSmk7dIOsE72MaGYGB'),
  computer_science: folder('1YoaO1QRaNlGMV2TPNNx_D405ukv5ZRq9'),
  art: folder('1tLTzoBVJO58d9MKjstN_RRYhPxJtUP2x'),
};

/**
 * A topic's own notes link if it has one, otherwise its subject's folder.
 *
 * Topics have no folder of their own - the structure stops at subject level, on
 * purpose, so there are 27 folders to keep tidy rather than several hundred.
 * Falling back means "open my notes" always goes somewhere useful instead of
 * being greyed out for every topic nobody has linked by hand.
 */
export function resolveTopicFolder(
  subjectId: SubjectId,
  topicNotesUrl?: string
): string | undefined {
  return topicNotesUrl?.trim() || SUBJECT_DRIVE_FOLDERS[subjectId];
}
