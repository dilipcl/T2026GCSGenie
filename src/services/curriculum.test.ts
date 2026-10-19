import { describe, it, expect } from 'vitest';
import { INITIAL_SUBJECTS } from '../db/seedData';
import { SubjectId } from '../types';
import { curriculumFor, placeTopic, refIsIn } from './curriculum';

/**
 * Placement is checked against Tejas's own topic titles from 18 Oct 2026,
 * typos and all - "Magnetic feilds", "Incomplet and normal Combustion",
 * "Balancing EQS*****" - because that is what it has to read, not a revision
 * guide's tidy headings.
 */

const subject = (id: SubjectId) => INITIAL_SUBJECTS.find((s) => s.id === id)!;
const place = (id: SubjectId, title: string, unit = '', specRef?: string) =>
  placeTopic({ title, unit, specRef }, curriculumFor(subject(id))).section?.ref;

describe('placing real topics in the specification', () => {
  const cases: Array<[SubjectId, string, string | undefined]> = [
    ['biology', 'Cell Division', '4.1'],
    ['biology', 'Microscopy: Plant & Animal Cell Magnification', '4.1'],
    ['biology', 'Osmosis in Plant Tissue (Mass change %)', '4.1'],
    ['biology', 'Pathogen Types', '4.3'],
    ['biology', 'Vaccines and Antibiotics', '4.3'],
    ['biology', 'Antiseptics Req Prac', '4.3'],
    ['chemistry', 'Crude Oil (Organic Chemistry)********', '4.7'],
    ['chemistry', 'Chromatography: Calculating Rf Values (< 1.0)', '4.8'],
    ['chemistry', 'Balancing EQS*****', '4.3'],
    ['chemistry', 'Pollution', '4.9'],
    ['chemistry', 'Incomplet and normal Combustion', '4.7'],
    ['chemistry', 'Cracking Hydrocarbons', '4.7'],
    ['physics', 'Energy Pathways and Energy Stores', '4.1'],
    ['physics', 'Specific Heat Capacity & Energy Transfers (E=Pxt)', '4.1'],
    ['physics', 'Series And Parallel Circuits', '4.2'],
    ['physics', 'Current and Charge', '4.2'],
    ['physics', 'Magnetic feilds', '4.7'],
    ['physics', 'Thermal Insulation & Rate of Cooling', '4.1'],
    ['physics', 'Plotting graph for potential diff', '4.2'],
    ['computer_science', 'Variables,Inputs,Outputs and Operators', '2.2'],
    ['computer_science', 'Ram Rom', '1.2'],
    ['computer_science', 'Primary and Secondary storage', '1.2'],
    ['computer_science', 'Nested ifs', '2.2'],
    ['computer_science', 'Parts Of the Comp(Input and Output)', '1.1'],
    ['computer_science', 'Networks: Protocols (TCP/IP, HTTP, HTTPS, DNS)', '1.3'],
    ['computer_science', 'Consistent On-Time Homework Submission Streak', undefined],
    ['maths', 'Single brackets expanding And factorising', 'A'],
    ['maths', 'Independent Probability Proofs (P(A∩B)=P(A)P(B))', 'P'],
    ['maths', 'Negative & Fractional Scale Factor Enlargements with (X,Y) Centers', 'G'],
    ['maths', 'Sine & Cosine Rules for Non-Right Angled Triangles', 'G'],
    ['maths', 'Geometric Sequences', 'A'],
    ['english_lit', 'How is Mr Hyde Introduced to the reader', '1B'],
    ['english_lit', 'Why Did Stevenson Write The Novel Jekyll and Hyde', '1B'],
    ['english_lang', 'Vocabulary, Embedding and zooming', '1A'],
    ['history', 'Cold War(USA and USSR)', '1B'],
    ['history', 'Economic Boom USA 1920s', '1A'],
    ['history', 'Immigration and African Americans', '1A'],
    ['history', '12-Mark Comparative Essay Structure with Definite Judgment', undefined],
    ['art', 'AO1: Critical & Contextual Research Investigation', 'AO1'],
    ['art', 'Experimenting with Lines Double Page', 'AO2'],
  ];

  it.each(cases)('%s: %s → %s', (id, title, expected) => {
    expect(place(id, title)).toBe(expected);
  });

  it('lets the title outvote a unit named after something else', () => {
    // The seed files Versailles under "Weimar Germany".
    expect(place('history', 'Treaty of Versailles Terms & Reparations', 'Weimar Germany')).toBe(
      '1B'
    );
  });

  it('places nothing on a tie rather than guessing', () => {
    expect(place('physics', 'Static Energy(Energy Types)')).toBeUndefined();
  });
});

describe('a spec reference decides', () => {
  it('beats the words in the title', () => {
    const placed = placeTopic(
      { title: 'Rates of reaction', unit: '', specRef: '4.3.2' },
      curriculumFor(subject('chemistry'))
    );
    expect(placed).toMatchObject({ placement: 'SPEC_REF', section: { ref: '4.3' } });
  });

  it('never files 4.10 under 4.1, and takes Maths letters with numbers', () => {
    expect(refIsIn('4.10.2', '4.1')).toBe(false);
    expect(refIsIn('4.10', '4.10')).toBe(true);
    expect(refIsIn('4.1.3', '4.1')).toBe(true);
    expect(refIsIn('A12', 'A')).toBe(true);
    expect(refIsIn('AO1', 'A')).toBe(false);
  });
});

describe('the right outline or none', () => {
  it('gives no outline when the board does not match', () => {
    expect(curriculumFor({ id: 'chemistry', examBoard: 'Edexcel' })).toBeUndefined();
    expect(curriculumFor({ id: 'maths', examBoard: 'Edexcel' })?.name).toMatch(/1MA1/);
  });

  it('has none for subjects with no specification', () => {
    expect(curriculumFor(subject('general'))).toBeUndefined();
  });
});
