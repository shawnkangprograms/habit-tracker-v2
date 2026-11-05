// The four one-tap reflection questions (docs/PACKS_REPORTS_SPEC.md, section 12; approved in the Stage 3 plan).
// Pure. Each answer is stored as its tag, never as its label, so the wording can change without touching records.
// Answering all four is what earns the reward; the optional free text never does.

export const QUESTIONS = [
  {id: 'feel', title: 'How did it feel?', options: [
    {tag: 'easy', label: 'Easy'},
    {tag: 'ok', label: 'OK'},
    {tag: 'hard', label: 'Hard'},
  ]},
  {id: 'amount', title: 'How much did you do?', options: [
    {tag: 'all', label: 'All of it'},
    {tag: 'most', label: 'Most of it'},
    {tag: 'little', label: 'A little'},
  ]},
  {id: 'helped', title: 'What helped most?', options: [
    {tag: 'reminder', label: 'A reminder'},
    {tag: 'routine', label: 'My routine'},
    {tag: 'someone', label: 'Someone else'},
    {tag: 'self', label: 'Just me'},
  ]},
  {id: 'blocker', title: 'Did anything get in the way?', options: [
    {tag: 'none', label: 'Nothing'},
    {tag: 'tired', label: 'Tired'},
    {tag: 'busy', label: 'Busy'},
    {tag: 'mood', label: 'Low mood'},
    {tag: 'other', label: 'Other'},
  ]},
] as const;

type Question = (typeof QUESTIONS)[number];
export type QuestionId = Question['id'];
export type Answers = {[Q in Question as Q['id']]: Q['options'][number]['tag']};
export type PartialAnswers = Partial<Answers>;

export function isAnswerTag(id: QuestionId, value: unknown): boolean {
  const question = QUESTIONS.find((q) => q.id === id);
  return !!question && question.options.some((o) => o.tag === value);
}

// Every question answered with one of its own tags
export function isComplete(answers: PartialAnswers): answers is Answers {
  return QUESTIONS.every((q) => isAnswerTag(q.id, answers[q.id]));
}

export function hasAnyAnswer(answers: PartialAnswers): boolean {
  return QUESTIONS.some((q) => answers[q.id] !== undefined);
}
