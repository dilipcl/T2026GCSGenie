import { SubjectConfig, SubjectId, SyllabusTopic } from '../types';

/**
 * The exam board's outline of each subject, so a topic list can be read against
 * what the course actually contains.
 *
 * A topic list on its own answers "what has been taught" and nothing about
 * "how far through are we": fifty-nine topics on 18 Oct 2026, and no way to
 * see that Biology had touched three of its seven sections and Physics four of
 * eight, or that nothing at all had been logged for Chemistry's quantitative
 * section. The board's own top-level sections are the fixed frame that makes
 * the gaps visible.
 *
 * **Top-level sections only, on purpose.** Each is the heading a revision guide
 * and a past paper use ("4.3 Infection and response"), and it is stable across
 * years. The sub-points under it change between spec versions and run to
 * hundreds of lines per subject; carrying them here would be a second copy of
 * the specification that goes stale silently. A topic's own `specRef` holds
 * the detail where somebody knows it.
 *
 * **Placement is suggested, never required.** A topic is placed by its
 * `specRef` when it has one, otherwise by the words in its title and unit. A
 * guess is shown as one and can be corrected from the topic's page, which
 * writes the section's reference into `specRef`. Nothing has to be entered for
 * any of this to work - adding a topic stays the two taps it was.
 *
 * Keyed by subject *and* board. An outline for the wrong board would place
 * topics confidently into sections the course does not have, so a subject
 * whose board does not match gets no outline rather than a wrong one.
 */

export interface SpecSection {
  /** The board's own reference: "4.3", "1.2", "N", "AO1". */
  ref: string;
  title: string;
  /**
   * Word starts that place a topic here. Matched at the start of a word, so
   * "osmosis" matches "Osmosis" and "ram" does not match "program".
   */
  keywords: string[];
}

export interface Curriculum {
  board: string;
  /** The qualification, as printed on the spec. */
  name: string;
  sections: SpecSection[];
}

const BIOLOGY: Curriculum = {
  board: 'AQA',
  name: 'GCSE Biology (8461)',
  sections: [
    {
      ref: '4.1',
      title: 'Cell biology',
      keywords: [
        'cell',
        'microscop',
        'magnification',
        'eukaryot',
        'prokaryot',
        'mitosis',
        'cell division',
        'stem cell',
        'diffusion',
        'osmosis',
        'active transport',
        'specialised',
        'culture',
      ],
    },
    {
      ref: '4.2',
      title: 'Organisation',
      keywords: [
        'organisation',
        'enzyme',
        'digest',
        'heart',
        'blood vessel',
        'lung',
        'circulat',
        'coronary',
        'health and disease',
        'non-communicable',
        'cancer',
        'transpiration',
        'xylem',
        'phloem',
        'leaf',
        'food test',
      ],
    },
    {
      ref: '4.3',
      title: 'Infection and response',
      keywords: [
        'infection',
        'pathogen',
        'communicable',
        'vaccin',
        'antibiotic',
        'antisept',
        'immune',
        'white blood',
        'bacteri',
        'virus',
        'viral',
        'fung',
        'protist',
        'monoclonal',
        'drug',
        'medicine',
        'plant disease',
      ],
    },
    {
      ref: '4.4',
      title: 'Bioenergetics',
      keywords: ['bioenerget', 'photosynth', 'respiration', 'anaerobic', 'aerobic', 'metabolism'],
    },
    {
      ref: '4.5',
      title: 'Homeostasis and response',
      keywords: [
        'homeostasis',
        'nervous',
        'reflex',
        'brain',
        'eye',
        'hormone',
        'insulin',
        'glucagon',
        'diabetes',
        'menstrual',
        'contracepti',
        'thermoregulat',
        'kidney',
        'reaction time',
        'plant hormone',
      ],
    },
    {
      ref: '4.6',
      title: 'Inheritance, variation and evolution',
      keywords: [
        'inherit',
        'dna',
        'genes',
        'genetic',
        'meiosis',
        'chromosome',
        'variation',
        'evolution',
        'natural selection',
        'selective breeding',
        'classification',
        'mutation',
        'cloning',
        'fossil',
        'extinction',
      ],
    },
    {
      ref: '4.7',
      title: 'Ecology',
      keywords: [
        'ecology',
        'ecosystem',
        'food chain',
        'food web',
        'biodiversity',
        'carbon cycle',
        'water cycle',
        'adaptation',
        'quadrat',
        'decay',
        'competition',
        'deforestation',
        'global warming',
      ],
    },
  ],
};

const CHEMISTRY: Curriculum = {
  board: 'AQA',
  name: 'GCSE Chemistry (8462)',
  sections: [
    {
      ref: '4.1',
      title: 'Atomic structure and the periodic table',
      keywords: [
        'atomic',
        'atoms',
        'isotope',
        'electron',
        'proton',
        'neutron',
        'periodic table',
        'group 1',
        'group 7',
        'group 0',
        'noble gas',
        'halogen',
        'alkali metal',
        'element',
        'compound',
        'mixture',
        'filtration',
        'crystallis',
        'simple distillation',
      ],
    },
    {
      ref: '4.2',
      title: 'Bonding, structure, and the properties of matter',
      keywords: [
        'bond',
        'ionic',
        'covalent',
        'metallic',
        'giant',
        'graphite',
        'diamond',
        'graphene',
        'fullerene',
        'nanoparticle',
        'states of matter',
        'polymer structure',
      ],
    },
    {
      ref: '4.3',
      title: 'Quantitative chemistry',
      keywords: [
        'quantitative',
        'mole',
        'relative formula',
        'conservation of mass',
        'balanc',
        'equation',
        'concentration',
        'yield',
        'atom economy',
        'limiting reactant',
      ],
    },
    {
      ref: '4.4',
      title: 'Chemical changes',
      keywords: [
        'chemical change',
        'reactivity',
        'acid',
        'alkali',
        'salt',
        'neutralis',
        'ph scale',
        'the ph',
        'electrolysis',
        'oxidation',
        'reduction',
        'redox',
        'titration',
        'displacement',
        'extraction of metal',
      ],
    },
    {
      ref: '4.5',
      title: 'Energy changes',
      keywords: [
        'energy change',
        'exothermic',
        'endothermic',
        'reaction profile',
        'bond energ',
        'chemical cell',
        'fuel cell',
        'temperature change',
      ],
    },
    {
      ref: '4.6',
      title: 'The rate and extent of chemical change',
      keywords: [
        'rate',
        'catalyst',
        'collision theory',
        'reversible',
        'equilibrium',
        'le chatelier',
      ],
    },
    {
      ref: '4.7',
      title: 'Organic chemistry',
      keywords: [
        'organic',
        'crude oil',
        'hydrocarbon',
        'alkane',
        'alkene',
        'crack',
        'fractional distillation',
        'combustion',
        'alcohol',
        'carboxylic',
        'polymeris',
        'ester',
      ],
    },
    {
      ref: '4.8',
      title: 'Chemical analysis',
      keywords: [
        'chemical analysis',
        'chromatograph',
        'rf value',
        'pure substance',
        'purity',
        'formulation',
        'flame test',
        'test for gas',
        'tests for gas',
        'ion test',
        'identify ion',
        'spectroscop',
      ],
    },
    {
      ref: '4.9',
      title: 'Chemistry of the atmosphere',
      keywords: [
        'atmosphere',
        'greenhouse',
        'climate',
        'carbon footprint',
        'pollut',
        'carbon monoxide',
        'sulfur dioxide',
        'sulphur dioxide',
        'particulate',
        'acid rain',
      ],
    },
    {
      ref: '4.10',
      title: 'Using resources',
      keywords: [
        'using resources',
        'potable',
        'waste water',
        'life cycle',
        'recycl',
        'corrosion',
        'rust',
        'alloy',
        'ceramic',
        'composite',
        'haber',
        'fertilis',
        'npk',
        'sustainab',
        'phytomining',
        'bioleaching',
      ],
    },
  ],
};

const PHYSICS: Curriculum = {
  board: 'AQA',
  name: 'GCSE Physics (8463)',
  sections: [
    {
      ref: '4.1',
      title: 'Energy',
      keywords: [
        'energy store',
        'energy pathway',
        'energy transfer',
        'energy type',
        'kinetic',
        'gravitational potential',
        'elastic potential',
        'specific heat',
        'efficiency',
        'insulation',
        'cooling',
        'energy resource',
        'renewable',
        'fossil fuel',
        'work done',
        'conservation of energy',
      ],
    },
    {
      ref: '4.2',
      title: 'Electricity',
      keywords: [
        'electric',
        'circuit',
        'current',
        'charge',
        'resistance',
        'resistor',
        'potential diff',
        'p.d',
        'series',
        'parallel',
        'ohm',
        'thermistor',
        'ldr',
        'diode',
        'mains',
        'national grid',
        'static',
        'i-v',
      ],
    },
    {
      ref: '4.3',
      title: 'Particle model of matter',
      keywords: [
        'particle model',
        'density',
        'change of state',
        'changes of state',
        'latent heat',
        'internal energy',
        'gas pressure',
      ],
    },
    {
      ref: '4.4',
      title: 'Atomic structure',
      keywords: [
        'radioactiv',
        'alpha',
        'beta',
        'gamma',
        'half-life',
        'half life',
        'nuclear',
        'fission',
        'fusion',
        'irradiat',
        'contamination',
        'atomic model',
        'plum pudding',
      ],
    },
    {
      ref: '4.5',
      title: 'Forces',
      keywords: [
        'force',
        'weight',
        'newton',
        'resultant',
        'velocity',
        'acceleration',
        'speed',
        'momentum',
        'stopping distance',
        'moment',
        'pressure in',
        'hooke',
        'spring',
        'terminal velocity',
        'distance-time',
        'velocity-time',
        'scalar',
        'vector',
      ],
    },
    {
      ref: '4.6',
      title: 'Waves',
      keywords: [
        'wave',
        'transverse',
        'longitudinal',
        'electromagnetic spectrum',
        'reflect',
        'refract',
        'sound',
        'lens',
        'light',
        'infrared',
        'microwave',
        'x-ray',
        'ultrasound',
        'seismic',
        'black body',
      ],
    },
    {
      ref: '4.7',
      title: 'Magnetism and electromagnetism',
      keywords: [
        'magnet',
        'electromagnet',
        'motor effect',
        'motor',
        'solenoid',
        'induc',
        'transformer',
        'generator',
        'fleming',
      ],
    },
    {
      ref: '4.8',
      title: 'Space physics',
      keywords: [
        'space',
        'solar system',
        'stars',
        'stellar',
        'orbit',
        'red-shift',
        'red shift',
        'big bang',
        'satellite',
        'universe',
        'galax',
      ],
    },
  ],
};

const COMPUTER_SCIENCE: Curriculum = {
  board: 'OCR',
  name: 'GCSE Computer Science (J277)',
  sections: [
    {
      ref: '1.1',
      title: 'Systems architecture',
      keywords: [
        'systems architecture',
        'cpu',
        'processor',
        'von neumann',
        'fetch',
        'register',
        'alu',
        'control unit',
        'cache',
        'clock speed',
        'cores',
        'embedded',
        'parts of the comp',
        'computer parts',
      ],
    },
    {
      ref: '1.2',
      title: 'Memory and storage',
      keywords: [
        'memory',
        'ram',
        'rom',
        'primary',
        'secondary',
        'storage',
        'virtual memory',
        'binary',
        'hexadecimal',
        'denary',
        'units of data',
        'compression',
        'ascii',
        'unicode',
        'character set',
        'bitmap',
        'sample rate',
        'optical',
        'solid state',
      ],
    },
    {
      ref: '1.3',
      title: 'Computer networks, connections and protocols',
      keywords: [
        'network',
        'lans',
        'local area',
        'wans',
        'wide area',
        'topolog',
        'protocol',
        'tcp',
        'http',
        'dns',
        'wifi',
        'wi-fi',
        'ethernet',
        'client-server',
        'peer-to-peer',
        'internet',
        'cloud',
        'layers',
        'ip address',
      ],
    },
    {
      ref: '1.4',
      title: 'Network security',
      keywords: [
        'security',
        'malware',
        'phishing',
        'social engineering',
        'brute force',
        'denial of service',
        'sql injection',
        'firewall',
        'encryption',
        'penetration',
      ],
    },
    {
      ref: '1.5',
      title: 'Systems software',
      keywords: ['systems software', 'operating system', 'utility', 'defragment', 'user interface'],
    },
    {
      ref: '1.6',
      title: 'Ethical, legal, cultural and environmental impacts',
      keywords: [
        'ethic',
        'legal',
        'data protection',
        'computer misuse',
        'copyright',
        'licen',
        'environmental',
        'privacy',
        'open source',
        'proprietary',
      ],
    },
    {
      ref: '2.1',
      title: 'Algorithms',
      keywords: [
        'algorithm',
        'decompos',
        'abstraction',
        'computational thinking',
        'flowchart',
        'pseudocode',
        'search',
        'sort',
        'bubble',
        'merge sort',
        'insertion',
        'trace table',
      ],
    },
    {
      ref: '2.2',
      title: 'Programming fundamentals',
      keywords: [
        'programming',
        'coding',
        'variable',
        'constant',
        'operator',
        'selection',
        'iteration',
        'loop',
        'if',
        'nested',
        'string',
        'array',
        'record',
        'file handling',
        'sql',
        'random',
        'sub program',
        'subprogram',
        'function',
        'procedure',
        'data type',
        'casting',
      ],
    },
    {
      ref: '2.3',
      title: 'Producing robust programs',
      keywords: [
        'robust',
        'validation',
        'authentication',
        'maintainab',
        'testing',
        'test data',
        'syntax error',
        'logic error',
        'defensive design',
      ],
    },
    {
      ref: '2.4',
      title: 'Boolean logic',
      keywords: ['boolean', 'logic gate', 'logic', 'truth table'],
    },
    {
      ref: '2.5',
      title: 'Programming languages and IDEs',
      keywords: [
        'high-level',
        'high level',
        'low-level',
        'low level',
        'compiler',
        'interpreter',
        'translator',
        'ides',
        'integrated development',
        'assembl',
      ],
    },
  ],
};

const MATHS: Curriculum = {
  board: 'EDEXCEL',
  name: 'GCSE Mathematics (1MA1)',
  sections: [
    {
      ref: 'N',
      title: 'Number',
      keywords: [
        'number',
        'fraction',
        'decimal',
        'percentage',
        'surd',
        'indices',
        'index law',
        'prime',
        'hcf',
        'lcm',
        'standard form',
        'bounds',
        'rounding',
        'recurring',
        'estimation',
      ],
    },
    {
      ref: 'A',
      title: 'Algebra',
      keywords: [
        'algebra',
        'expand',
        'factoris',
        'factoriz',
        'bracket',
        'equation',
        'quadratic',
        'simultaneous',
        'inequalit',
        'sequence',
        'nth term',
        'graph',
        'function',
        'formula',
        'rearrang',
        'proof',
        'iteration',
        'gradient',
        'completing the square',
      ],
    },
    {
      ref: 'R',
      title: 'Ratio, proportion and rates of change',
      keywords: [
        'ratio',
        'proportion',
        'rates of change',
        'compound interest',
        'growth',
        'depreciation',
        'direct proportion',
        'inverse proportion',
        'best buy',
      ],
    },
    {
      ref: 'G',
      title: 'Geometry and measures',
      keywords: [
        'geometry',
        'angle',
        'triangle',
        'polygon',
        'circle',
        'area',
        'volume',
        'perimeter',
        'pythagoras',
        'trigonometr',
        'sine',
        'cosine',
        'tangent',
        'vector',
        'transformation',
        'enlargement',
        'scale factor',
        'rotation',
        'reflection',
        'translation',
        'congruen',
        'similar',
        'bearing',
        'construction',
        'loci',
        'arc',
        'sector',
      ],
    },
    {
      ref: 'P',
      title: 'Probability',
      keywords: [
        'probability',
        'venn',
        'tree diagram',
        'independent',
        'outcome',
        'relative frequency',
        'expected',
      ],
    },
    {
      ref: 'S',
      title: 'Statistics',
      keywords: [
        'statistic',
        'average',
        'mean',
        'median',
        'mode',
        'histogram',
        'cumulative frequency',
        'box plot',
        'scatter',
        'sampling',
        'frequency table',
        'pie chart',
      ],
    },
  ],
};

const ENGLISH_LIT: Curriculum = {
  board: 'AQA',
  name: 'GCSE English Literature (8702)',
  sections: [
    {
      ref: '1A',
      title: 'Shakespeare',
      keywords: [
        'shakespeare',
        'macbeth',
        'romeo',
        'juliet',
        'tempest',
        'merchant of venice',
        'much ado',
        'julius caesar',
      ],
    },
    {
      ref: '1B',
      title: 'The 19th-century novel',
      keywords: [
        '19th',
        'jekyll',
        'hyde',
        'stevenson',
        'christmas carol',
        'scrooge',
        'dickens',
        'great expectations',
        'frankenstein',
        'jane eyre',
        'pride and prejudice',
        'sign of four',
        'sherlock',
        'novella',
      ],
    },
    {
      ref: '2A',
      title: 'Modern prose or drama',
      keywords: [
        'modern text',
        'inspector calls',
        'priestley',
        'birling',
        'blood brothers',
        'lord of the flies',
        'animal farm',
        'never let me go',
        'anita and me',
        'the history boys',
        'dna',
      ],
    },
    {
      ref: '2B',
      title: 'Poetry anthology',
      keywords: [
        'anthology',
        'power and conflict',
        'love and relationships',
        'poem',
        'poetry',
        'ozymandias',
        'exposure',
        'kamikaze',
        'remains',
        'london',
      ],
    },
    {
      ref: '2C',
      title: 'Unseen poetry',
      keywords: ['unseen'],
    },
  ],
};

const ENGLISH_LANG: Curriculum = {
  board: 'AQA',
  name: 'GCSE English Language (8700)',
  sections: [
    {
      ref: '1A',
      title: 'Paper 1 reading: fiction',
      keywords: [
        'fiction',
        'language analysis',
        'language',
        'structure',
        'extract',
        'evaluat',
        'zoom',
        'vocabulary',
        'embedding',
        'quotation',
        'method',
      ],
    },
    {
      ref: '1B',
      title: 'Paper 1 writing: descriptive or narrative',
      keywords: ['descriptive', 'description', 'narrative', 'creative writing', 'story'],
    },
    {
      ref: '2A',
      title: 'Paper 2 reading: non-fiction',
      keywords: [
        'non-fiction',
        'nonfiction',
        'viewpoint',
        'perspective',
        'compar',
        'summary',
        'synthes',
      ],
    },
    {
      ref: '2B',
      title: 'Paper 2 writing: a viewpoint',
      keywords: ['persuasive', 'argument', 'letter', 'article', 'speech', 'transactional'],
    },
    {
      ref: 'SL',
      title: 'Spoken language',
      keywords: ['spoken', 'presentation', 'speaking'],
    },
  ],
};

/**
 * History's four sections hold one option each, chosen by the school, and the
 * app does not know which. The keywords cover the options most schools teach
 * with the America period study and the 1918-39 depth study Tejas's topics
 * show; a topic from another option lands in "not placed", which is honest.
 */
const HISTORY: Curriculum = {
  board: 'AQA',
  name: 'GCSE History (8145)',
  sections: [
    {
      ref: '1A',
      title: 'Period study',
      keywords: [
        'period study',
        'america',
        'usa',
        '1920',
        'boom',
        'prohibition',
        'immigration',
        'african american',
        'ku klux',
        'wall street',
        'depression',
        'new deal',
        'roosevelt',
        'civil rights',
        'great society',
        'kaiser',
        'weimar republic',
        'hitler',
        'nazi',
        'tsar',
        'lenin',
        'stalin',
        'mao',
      ],
    },
    {
      ref: '1B',
      title: 'Wider world depth study',
      keywords: [
        'wider world',
        'versailles',
        'reparations',
        'league of nations',
        'appeasement',
        'munich',
        'lebensraum',
        'living room',
        'abyssinia',
        'manchuria',
        'cold war',
        'ussr',
        'berlin',
        'cuba',
        'korea',
        'vietnam',
        'first world war',
        '1914',
        'alliance',
      ],
    },
    {
      ref: '2A',
      title: 'Thematic study',
      keywords: [
        'thematic',
        'health and the people',
        'medicine',
        'power and the people',
        'migration, empire',
        'empire',
        'magna carta',
        'black death',
        'plague',
      ],
    },
    {
      ref: '2B',
      title: 'British depth study',
      keywords: [
        'british depth',
        'norman',
        'elizabeth',
        'medieval',
        'restoration',
        'conquest',
        '1066',
        'historic environment',
      ],
    },
  ],
};

const ART: Curriculum = {
  board: 'AQA',
  name: 'GCSE Art and Design (8202)',
  sections: [
    {
      ref: 'AO1',
      title: 'Develop: research and context',
      keywords: ['ao1', 'research', 'context', 'artist', 'critical', 'investigat'],
    },
    {
      ref: 'AO2',
      title: 'Refine: media and experimenting',
      keywords: [
        'ao2',
        'experiment',
        'media',
        'refine',
        'technique',
        'print',
        'mono',
        'lines',
        'forms',
      ],
    },
    {
      ref: 'AO3',
      title: 'Record: observation and ideas',
      keywords: ['ao3', 'record', 'drawing', 'observ', 'photograph', 'annotat', 'sketch'],
    },
    {
      ref: 'AO4',
      title: 'Present: a personal response',
      keywords: ['ao4', 'final piece', 'outcome', 'present', 'realis', 'exam piece'],
    },
  ],
};

const CURRICULA: Partial<Record<SubjectId, Curriculum>> = {
  biology: BIOLOGY,
  chemistry: CHEMISTRY,
  physics: PHYSICS,
  computer_science: COMPUTER_SCIENCE,
  maths: MATHS,
  english_lit: ENGLISH_LIT,
  english_lang: ENGLISH_LANG,
  history: HISTORY,
  art: ART,
};

const normaliseBoard = (board?: string) => (board ?? '').replace(/[^a-z]/gi, '').toUpperCase();

/** The outline for a subject, or nothing when the board is not the one it was written for. */
export function curriculumFor(
  subject?: Pick<SubjectConfig, 'id' | 'examBoard'>
): Curriculum | undefined {
  if (!subject) return undefined;
  const outline = CURRICULA[subject.id];
  if (!outline) return undefined;
  return normaliseBoard(subject.examBoard) === normaliseBoard(outline.board) ? outline : undefined;
}

/**
 * Whether a spec reference falls under a section: "4.2.1" under "4.2", "A12"
 * under "A". "4.10" is not under "4.1", which a bare prefix test would get
 * wrong for every Chemistry topic in "Using resources".
 */
export function refIsIn(specRef: string, sectionRef: string): boolean {
  const ref = specRef.trim().toUpperCase();
  const section = sectionRef.toUpperCase();
  if (ref === section || ref.startsWith(`${section}.`)) return true;
  // Letter sections (Maths's N, A, G...) take a number straight after.
  return /^[A-Z]+$/.test(section) && new RegExp(`^${section}\\d`).test(ref);
}

/** How a topic came to be in its section. */
export type Placement = 'SPEC_REF' | 'SUGGESTED';

export interface PlacedTopic {
  section?: SpecSection;
  placement?: Placement;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function hits(text: string, section: SpecSection): number {
  const lower = text.toLowerCase();
  return section.keywords.filter((k) => new RegExp(`(^|[^a-z0-9])${escape(k)}`).test(lower)).length;
}

/**
 * Which section a topic belongs to.
 *
 * Its own `specRef` decides when it has one that fits the outline. Otherwise the
 * section whose words appear most often in the title, with the teacher's unit
 * name as a tiebreaker worth half - a unit called "Weimar Germany" over a topic
 * about the Treaty of Versailles should not outvote the title. A tie between
 * sections is no answer at all rather than the first one listed: a confident
 * wrong placement is worse than an honest "not placed".
 */
export function placeTopic(
  topic: Pick<SyllabusTopic, 'title' | 'unit' | 'specRef'>,
  outline?: Curriculum
): PlacedTopic {
  if (!outline) return {};
  if (topic.specRef?.trim()) {
    const byRef = outline.sections.find((s) => refIsIn(topic.specRef!, s.ref));
    if (byRef) return { section: byRef, placement: 'SPEC_REF' };
  }

  const scored = outline.sections
    .map((section) => ({
      section,
      score: hits(topic.title, section) * 2 + hits(topic.unit ?? '', section),
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return {};
  if (scored.length > 1 && scored[0].score === scored[1].score) return {};
  return { section: scored[0].section, placement: 'SUGGESTED' };
}
