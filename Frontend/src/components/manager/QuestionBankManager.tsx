import { useState } from 'react';
import { fetchWithAuth } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useQuestions,
  useCreateQuestion,
  useDeleteQuestion,
  useExams
} from '@/hooks/useManagerData';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Plus,
  FileQuestion,
  Trash2,
  Search,
  Sparkles,
  Brain,
  CheckCircle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
  Layers,
  ClipboardList,
  ArrowRight,
  Calendar,
  ShieldCheck,
  Database,
  History,
  Code2,
  Terminal as TerminalIcon
} from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { SyncDataButton } from '../admin/data/SyncDataButton';

// ... (Constants)

// ... (parseAiText function)
// I will not include the full parseAiText function here to avoid complexity in this tool call if I can avoid it.
// But I need to remove console.log inside it.
// Accessing it via searching for the console.log line might be better in a separate call?
// No, I'll do it all here since I'm touching imports and the main component.

// Actually, `replace_file_content` requires me to match `TargetContent`.
// If I try to do too much, I might miss.
// I'll do imports first.


// ─── Constants ───────────────────────────────────────────────────────────────

const N8N_WEBHOOK = import.meta.env.VITE_N8N_WEBHOOK_URL || 'https://aotms.app.n8n.cloud/webhook/generate-quiz';

const DIFFICULTY_COLOR = {
  easy: 'text-emerald-500',
  medium: 'text-amber-500',
  hard: 'text-rose-500',
} as const;

const DIFFICULTY_BADGE_VARIANT = {
  easy: 'default',
  medium: 'secondary',
  hard: 'destructive',
} as const;

const QUESTION_TYPES = [
  { value: 'mcq', label: 'Multiple Choice (MCQ)' },
  { value: 'true_false', label: 'True / False' },
  { value: 'short', label: 'Short Answer' },
  { value: 'long', label: 'Long Answer / Essay' },
  { value: 'fill_blank', label: 'Fill in the Blank' },
  { value: 'coding', label: 'Coding / Practical' },
];

const SUPPORTED_LANGUAGES = [
  { value: 'python', label: 'Python 3' },
  { value: 'javascript', label: 'JavaScript (Node.js)' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'cpp', label: 'C++' },
  { value: 'c', label: 'C' },
  { value: 'java', label: 'Java' },
  { value: 'csharp', label: 'C# (.NET)' },
  { value: 'sql', label: 'SQL (SQLite)' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'php', label: 'PHP' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'swift', label: 'Swift' },
];

export interface TestCaseFormItem {
  input: string;
  expected_output: string;
  explanation?: string;
  is_hidden?: boolean;
}

export interface QuestionFormItem {
  topic: string;
  question_text: string;
  type: string;
  language?: string;
  difficulty: string;
  options?: string[];
  correct_answer: string;
  explanation?: string;
  input_format?: string;
  output_format?: string;
  constraints?: string;
  sample_input?: string;
  sample_output?: string;
  test_cases?: TestCaseFormItem[];
  marks: number;
}

const EMPTY_QUESTION: QuestionFormItem = {
  topic: '',
  question_text: '',
  type: 'mcq',
  language: 'python',
  difficulty: 'medium',
  options: ['', '', '', ''],
  correct_answer: '',
  explanation: '',
  input_format: '',
  output_format: '',
  constraints: '',
  sample_input: '',
  sample_output: '',
  test_cases: [
    { input: '', expected_output: '', explanation: '', is_hidden: false }
  ],
  marks: 1,
};

// ─── AI Panel Types ───────────────────────────────────────────────────────────

export interface AiQuestion {
  topic?: string;
  question_text: string;
  type?: string;
  question_type?: string;
  difficulty?: string;
  options?: string[];
  correct_answer?: string;
  explanation?: string;
  marks?: number;
  [key: string]: unknown;
}

interface AiAnalysisResult {
  questions?: AiQuestion[];
  rawText: string;        // always keep original AI text
  parseError?: string;   // if parsing failed
}

/**
 * Parse the plain-text / markdown output from n8n.
 * Supports:
 * 1. JSON structure `[{ "output": "..." }]`
 * 2. Numbered lists `1. Question`
 * 3. Markdown bold headers `**Question**` (without numbers)
 */
function parseAiText(
  text: string,
  fallbackTopic: string,
  fallbackType: string,
  fallbackDifficulty: string,
): AiAnalysisResult {
  let rawText = text.trim();

  // ── 0. Pre-clean: Remove markdown code blocks if present ──
  const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (jsonMatch) {
    rawText = jsonMatch[1].trim();
  }

  // ── 1. Try to extract inner text from JSON wrapper or parse direct JSON ──
  try {
    let json = JSON.parse(rawText);

    // Normalize: If it's an n8n wrapper like [{ output: "..." }] or { output: "..." }
    if (Array.isArray(json) && json.length > 0 && json[0].output && typeof json[0].output === 'string') {
      const innerText = json[0].output;
      try {
        const innerMatch = innerText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        json = JSON.parse(innerMatch ? innerMatch[1] : innerText);
      } catch (e) {
        rawText = innerText;
      }
    } else if (typeof json === 'object' && json !== null && json.output && typeof json.output === 'string') {
      const innerText = json.output;
      try {
        const innerMatch = innerText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        json = JSON.parse(innerMatch ? innerMatch[1] : innerText);
      } catch (e) {
        rawText = innerText;
      }
    }

    /**
     * Helper to recursively look for any array that might be the questions array.
     */
    const findQuestionsArray = (obj: unknown): unknown[] | null => {
      if (Array.isArray(obj)) {
        // Check if elements look like questions
        const looksLikeQuestions = obj.length > 0 && obj.some(item => 
          item && typeof item === 'object' && ('question' in item || 'question_text' in item || 'text' in item || 'Question' in item)
        );
        if (looksLikeQuestions) return obj;
        
        // If not, maybe it's an array of objects that have the array inside?
        for (const item of obj) {
          const found = findQuestionsArray(item);
          if (found) return found;
        }
      } else if (typeof obj === 'object' && obj !== null) {
        const o = obj as Record<string, unknown>;
        
        // NEW: Check if this object itself IS a question
        if ('question' in o || 'question_text' in o || 'text' in o || 'Question' in o || 'QuestionText' in o) {
          return [obj];
        }

        // Check standard keys
        if (Array.isArray(o.questions)) return o.questions as unknown[];
        if (Array.isArray(o.data)) return o.data as unknown[];
        if (Array.isArray(o.items)) return o.items as unknown[];
        if (Array.isArray(o.output)) return o.output as unknown[];
        if (o.data && typeof o.data === 'object') return findQuestionsArray(o.data);
        
        // Search all keys
        for (const key in o) {
          if (key === 'questions' || key === 'data' || key === 'items' || key === 'output') continue;
          const found = findQuestionsArray(o[key]);
          if (found) return found;
        }
      }
      return null;
    };

    const questionsArray = findQuestionsArray(json);

    if (questionsArray && questionsArray.length > 0) {
      const mappedQuestions: AiQuestion[] = [];

      for (const item of questionsArray) {
        const itemObj = item as Record<string, unknown>;
        // loose check for question-like object
        const qText = String(itemObj.question || itemObj.question_text || itemObj.Question || itemObj.questionText || itemObj.text || '');

        if (!qText) continue;

        // Options
        let opts: string[] = [];
        const itemOptions = itemObj.options;
        if (Array.isArray(itemOptions)) {
          opts = itemOptions.map((o: unknown) => {
            if (typeof o === 'object' && o !== null) {
              const oObj = o as Record<string, unknown>;
              return String(oObj.text || oObj.option || String(o));
            }
            return String(o);
          });
        } else if (itemObj.optionA || itemObj.OptionA) {
          opts = [
            itemObj.optionA, itemObj.optionB, itemObj.optionC, itemObj.optionD, itemObj.optionE,
            itemObj.OptionA, itemObj.OptionB, itemObj.OptionC, itemObj.OptionD, itemObj.OptionE
          ].filter(Boolean).map(String);
        } else if (typeof itemOptions === 'object' && itemOptions !== null) {
          opts = Object.values(itemOptions).map((o: unknown) => {
             if (o && typeof o === 'object') {
               const oObj = o as Record<string, unknown>;
               return String(oObj.text || o);
             }
             return String(o);
          });
        }

        // Correct Answer
        let ans = String(itemObj.answer || itemObj.correct_answer || itemObj.Answer || itemObj.correctAnswer || '');

        // NEW: If correct_answer was not found at the root, check if any option has isCorrect: true
        if (!ans && Array.isArray(itemOptions)) {
          const correctOpt = itemOptions.find((o: unknown) => 
            o && typeof o === 'object' && ((o as Record<string, unknown>).isCorrect === true || (o as Record<string, unknown>).is_correct === true)
          );
          if (correctOpt) {
            const coObj = correctOpt as Record<string, unknown>;
            ans = String(coObj.text || coObj.option || String(correctOpt));
          }
        }

        // Resolve "A", "B", etc.
        if (opts.length > 0 && /^[A-E]$/i.test(String(ans))) {
          const idx = String(ans).toUpperCase().charCodeAt(0) - 65;
          if (opts[idx]) ans = opts[idx];
        }

        const rawDiff = String(itemObj.difficulty || fallbackDifficulty).toLowerCase();
        let normDifficulty = 'medium';
        if (rawDiff.includes('easy') || rawDiff.includes('simple')) normDifficulty = 'easy';
        else if (rawDiff.includes('hard') || rawDiff.includes('difficult') || rawDiff.includes('deficult')) normDifficulty = 'hard';

        const rawType = String(itemObj.type || itemObj.question_type || fallbackType).toLowerCase();
        let normType = 'mcq';
        if (rawType.includes('true') || rawType.includes('boolean')) normType = 'true_false';
        else if (rawType.includes('short')) normType = 'short';
        else if (rawType.includes('long') || rawType.includes('essay')) normType = 'long';
        else if (rawType.includes('fill') || rawType.includes('blank')) normType = 'fill_blank';
        else if (rawType.includes('code') || rawType.includes('coding') || rawType.includes('practical')) normType = 'coding';

        mappedQuestions.push({
          topic: String(itemObj.topic || fallbackTopic),
          question_text: qText,
          type: normType,
          difficulty: normDifficulty,
          options: opts.length >= 2 ? opts : (normType === 'true_false' ? ['True', 'False'] : undefined),
          correct_answer: ans,
          explanation: String(itemObj.explanation || itemObj.Explanation || ''),
          language: String(itemObj.language || itemObj.target_language || 'python'),
          input_format: String(itemObj.input_format || itemObj.inputFormat || ''),
          output_format: String(itemObj.output_format || itemObj.outputFormat || ''),
          constraints: String(itemObj.constraints || ''),
          sample_input: String(itemObj.sample_input || itemObj.sampleInput || ''),
          sample_output: String(itemObj.sample_output || itemObj.sampleOutput || ''),
          test_cases: (Array.isArray(itemObj.test_cases) ? itemObj.test_cases : (Array.isArray(itemObj.testCases) ? itemObj.testCases : [])) as TestCaseFormItem[],
          marks: Number(itemObj.marks) || (normDifficulty === 'hard' ? 5 : normDifficulty === 'medium' ? 2 : 1),
        });
      }

      if (mappedQuestions.length > 0) {
        return { rawText, questions: mappedQuestions };
      }
    }
  } catch (e) {
    // Not valid JSON, treat as raw markdown/text
  }

  // ── 1.5. Try to Parse Markdown Tables ──
  if (rawText.includes('|') && rawText.includes('\n|')) {
    const tableLines = rawText.split('\n').map(l => l.trim()).filter(l => l.startsWith('|'));
    if (tableLines.length >= 3) {
      const dataRows = tableLines.slice(2);
      const tableQuestions: AiQuestion[] = [];

      for (const row of dataRows) {
        const cols = row.split('|').map(c => c.trim()).filter((col, i, arr) => i > 0 && i < arr.length - 1);
        if (cols.length >= 3) {
          const qTextCol = cols.length === 3 ? cols[0] : cols[1];
          const optsCol = cols.length === 3 ? cols[1] : cols[2];
          const ansCol = cols.length === 3 ? cols[2] : cols[3];

          const qText = qTextCol.replace(/\*\*/g, '').trim();
          let opts = optsCol.split(/<br\s*\/?>|\n/gi).map(o => o.trim()).filter(Boolean).map(o => o.replace(/^\s*[A-E][.)]\s*/i, '').replace(/\*\*/g, '').trim());
          if (opts.length < 2) {
            const manualSplit = optsCol.split(/\s*\b[A-E][.)]\s+/i).map(o => o.trim()).filter(Boolean);
            if (manualSplit.length >= 2) opts = manualSplit;
          }

          let ansLetter = ansCol.replace(/\*\*/g, '').trim().toUpperCase();
          const letterMatch = ansLetter.match(/^([A-E])\b/i);
          if (letterMatch) ansLetter = letterMatch[1].toUpperCase();

          let finalAns = ansLetter;
          if (/^[A-E]$/.test(ansLetter)) {
            const idx = ansLetter.charCodeAt(0) - 65;
            if (opts[idx]) finalAns = opts[idx];
          }

          tableQuestions.push({
            topic: fallbackTopic,
            question_text: qText,
            question_type: fallbackType,
            difficulty: fallbackDifficulty,
            options: opts.length >= 2 ? opts : undefined,
            correct_answer: finalAns,
            marks: 1
          });
        }
      }
      if (tableQuestions.length > 0) return { rawText, questions: tableQuestions };
    }
  }

  // ── 2. Split into Blocks ──
  const activeText = rawText
    .replace(/\*\*\s*Question/gi, '\n**Question')
    .replace(/^Question/gm, '\nQuestion');

  const splitRegex = /\n(?=(?:\d+[.)])|(?:\*\*Question)|(?:Question\s))/i;
  let blocks = activeText.split(splitRegex).map(b => b.trim()).filter(Boolean);
  if (blocks.length === 0 && rawText.length > 10) blocks = [rawText];

  const questions: AiQuestion[] = [];
  for (const block of blocks) {
    if (!block.match(/Question|\?|Option/i)) continue;
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) continue;

    let questionLine = lines[0].replace(/^\d+[.)\s]+/, '').replace(/^\**Question\s*(\(.*\))?\**[:\s-]*/i, '').replace(/^Q[:\s]*/i, '').replace(/\*\*/g, '').trim();
    if (!questionLine && lines.length > 1) questionLine = lines[1].replace(/\*\*/g, '').trim();

    const options: string[] = [];
    let correctAnswer = '';
    let explanation = '';

    for (const line of lines) {
      const optMatch = line.match(/^[-*\u2022]?\s*(\*{0,2}[A-E]\*{0,2})[.)\s]+(.+)/);
      if (optMatch) {
        options.push(optMatch[2].replace(/\*\*/g, '').trim());
        continue;
      }
      const ansMatch = line.match(/^\*{0,2}(?:Correct\s*)?Answer\*{0,2}[:\s]+(.+)/i);
      if (ansMatch) {
        let ansText = ansMatch[1].replace(/\*\*/g, '').trim();
        // If it's just a letter and we have options, map the letter to the option text
        const letterMatch = ansText.match(/^([A-E])\b/i);
        if (letterMatch && options.length > 0) {
          const idx = letterMatch[1].toUpperCase().charCodeAt(0) - 65;
          if (options[idx]) ansText = options[idx];
        }
        correctAnswer = ansText;
        continue;
      }
      const expMatch = line.match(/^\*{0,2}Explanation\*{0,2}[:\s]+(.+)/i);
      if (expMatch) {
        explanation = expMatch[1].replace(/\*\*/g, '').trim();
        continue;
      }
    }
    if (!questionLine) continue;
    questions.push({
      topic: fallbackTopic,
      question_text: questionLine,
      question_type: fallbackType,
      difficulty: fallbackDifficulty,
      options: options.length >= 2 ? options : undefined,
      correct_answer: correctAnswer,
      explanation: explanation || undefined,
      marks: 1,
    });
  }

  if (questions.length > 0) return { rawText, questions };
  return { rawText, parseError: 'Could not parse questions. Try ensuring the format is "Question: ... \n A) ... \n Answer: ..."' };
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function DifficultyBar({ easy, medium, hard, total }: { easy: number; medium: number; hard: number; total: number }) {
  if (total === 0) return null;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="bg-emerald-500 transition-all"
        style={{ width: `${(easy / total) * 100}%` }}
      />
      <div
        className="bg-amber-400 transition-all"
        style={{ width: `${(medium / total) * 100}%` }}
      />
      <div
        className="bg-rose-500 transition-all"
        style={{ width: `${(hard / total) * 100}%` }}
      />
    </div>
  );
}

function QuestionTypeIcon({ type }: { type: string }) {
  const map: Record<string, string> = {
    mcq: '◉',
    true_false: '⊘',
    short: '✎',
    long: '≡',
    fill_blank: '▭',
    coding: '</>',
  };
  return (
    <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
      {map[type] ?? type}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function QuestionBankManager({
  onSectionChange,
  initialTab = 'bank',
  mode = 'manager',
  onSync,
  loading: parentLoading = false
}: {
  onSectionChange?: (section: string) => void;
  initialTab?: string;
  mode?: 'manager' | 'instructor';
  onSync?: () => void;
  loading?: boolean;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: questions = [], isLoading, refetch: refetchQuestions } = useQuestions();
  const { refetch: refetchExams } = useExams();
  const createQuestion = useCreateQuestion();
  const deleteQuestion = useDeleteQuestion();

  // ─── Global Controls for Bulk Editor ───
  // These control the "next batch" of questions to be added
  const [globalTopic, setGlobalTopic] = useState('');
  const [globalType, setGlobalType] = useState('mcq');
  const [globalDifficulty, setGlobalDifficulty] = useState('medium');
  const [globalCount, setGlobalCount] = useState(1);
  const [globalMarks, setGlobalMarks] = useState(1);
  const [globalPrompt, setGlobalPrompt] = useState(''); // for AI context

  // ─── Batch Editor State ───
  // Questions currently being edited before saving
  const [batchQuestions, setBatchQuestions] = useState<QuestionFormItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // ─── Save Dialog State ───
  const { data: exams = [] } = useExams();
  const [isSaveWizardOpen, setIsSaveWizardOpen] = useState(false);
  const [selectedExamId, setSelectedExamId] = useState('');

  // ─── AI State ───
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [rawInput, setRawInput] = useState(''); // Stores raw text (from AI or User Paste)
  const [showRaw, setShowRaw] = useState(true); // Default to true so user sees the input area

  // ─── Existing Questions Filter State ───
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTopic, setFilterTopic] = useState('all');
  const [filterDifficulty, setFilterDifficulty] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ─── Derived Data ───
  const topics = [...new Set(questions.map(q => q.topic))];

  const topicStats = topics.map(topic => {
    const tq = questions.filter(q => q.topic === topic);
    return {
      topic,
      total: tq.length,
      easy: tq.filter(q => q.difficulty === 'easy').length,
      medium: tq.filter(q => q.difficulty === 'medium').length,
      hard: tq.filter(q => q.difficulty === 'hard').length,
    };
  });

  const filteredQuestions = questions.filter(q => {
    const matchesSearch =
      q.question_text.toLowerCase().includes(searchTerm.toLowerCase()) ||
      q.topic.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTopic = filterTopic === 'all' || q.topic === filterTopic;
    const matchesDifficulty = filterDifficulty === 'all' || q.difficulty === filterDifficulty;
    const matchesType = filterType === 'all' || q.type === filterType;
    return matchesSearch && matchesTopic && matchesDifficulty && matchesType;
  });

  const stats = {
    total: questions.length,
    easy: questions.filter(q => q.difficulty === 'easy').length,
    medium: questions.filter(q => q.difficulty === 'medium').length,
    hard: questions.filter(q => q.difficulty === 'hard').length,
    typeBreakdown: QUESTION_TYPES.map(t => ({
      ...t,
      count: questions.filter(q => q.type === t.value).length,
    })),
  };

  // ─── Actions ───

  const handleAddBlanks = (specificType?: string) => {
    if (!globalTopic.trim()) {
      toast({
        title: "Topic Required",
        description: "Please enter a topic first.",
        variant: "destructive"
      });
      return;
    }
    const targetType = specificType || globalType;
    const blanks = Array.from({ length: Math.max(1, globalCount) }).map(() => ({
      ...EMPTY_QUESTION,
      topic: globalTopic,
      type: targetType,
      difficulty: globalDifficulty,
      marks: globalMarks,
    }));
    setBatchQuestions(prev => [...prev, ...blanks]);
  };

  const handleUpdateQuestion = (index: number, field: string, value: unknown) => {
    setBatchQuestions(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleUpdateOption = (qIndex: number, optIndex: number, value: string) => {
    setBatchQuestions(prev => {
      const next = [...prev];
      const opts = [...(next[qIndex].options || ['', '', '', ''])];
      opts[optIndex] = value;
      next[qIndex] = { ...next[qIndex], options: opts };
      return next;
    });
  };

  const handleRemoveQuestion = (index: number) => {
    setBatchQuestions(prev => prev.filter((_, i) => i !== index));
  };

  const handleAiAnalyze = async () => {
    if (!globalTopic.trim()) {
      toast({
        title: "Topic Required",
        description: "Please enter a topic first to generate questions.",
        variant: "destructive"
      });
      return;
    }

    setAiLoading(true);
    setAiError(null);
    setRawInput('');

    try {
      const data = await fetchWithAuth('/manager/generate-questions', {
        method: 'POST',
        body: JSON.stringify({
          topic: globalTopic,
          type: globalType,
          count: globalCount,
          difficulty: globalDifficulty,
          prompt: globalPrompt || `Generate ${globalCount} ${globalType} questions about ${globalTopic}`
        }),
      });

      let rawText = '';
      if (typeof data === 'string') {
        rawText = data;
      } else if (data && typeof data === 'object') {
        // If n8n returned an error but included the raw text
        const d = data as Record<string, unknown>;
        if (d.raw) {
          rawText = String(d.raw);
        } else {
          rawText = JSON.stringify(data, null, 2);
        }
      }

      // Attempt Automatic Parsing & Distribution
      const parsed = parseAiText(rawText, globalTopic, globalType, globalDifficulty);

      if (parsed.questions && parsed.questions.length > 0) {
        // Success! Auto-fill
        const newForms = parsed.questions.map(q => ({
          ...EMPTY_QUESTION,
          topic: globalTopic,
          type: q.type || globalType,
          difficulty: q.difficulty || globalDifficulty,
          question_text: q.question_text,
          options: (q.options && q.options.length >= 2) ? q.options : ['', '', '', ''],
          correct_answer: q.correct_answer || '',
          explanation: (q.explanation || (q as Record<string, unknown>).explanation || '') as string,
          input_format: ((q as Record<string, unknown>).input_format || '') as string,
          output_format: ((q as Record<string, unknown>).output_format || '') as string,
          constraints: ((q as Record<string, unknown>).constraints || '') as string,
          sample_input: ((q as Record<string, unknown>).sample_input || '') as string,
          sample_output: ((q as Record<string, unknown>).sample_output || '') as string,
          test_cases: ((q as Record<string, unknown>).test_cases || []) as { input: string; expected_output: string; explanation?: string; is_hidden?: boolean }[],
          marks: q.marks || globalMarks,
        }));

        setBatchQuestions(prev => [...prev, ...newForms]);

        // Show raw input collapsed initially since it worked
        // But store it in case user wants to see
        setRawInput(rawText);
        setShowRaw(false);

        toast({
          title: "AI Generation Successful",
          description: `Generated and added ${parsed.questions.length} questions.`,
        });

      } else {
        // Fallback: Parsing failed, show raw input for manual check
        setRawInput(rawText);
        setShowRaw(true);
        if (parsed.parseError) {
          setAiError("Could not auto-parse JSON. Please review raw output below.");
        }
        toast({
          title: "Check AI Output",
          description: "Questions were generated but couldn't be automatically mapped. Please check the 'AI Output' section.",
          variant: "default" // Not destructive, just a warning
        });
      }

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setAiError(errorMsg);
      toast({
        title: "AI Generation Error",
        description: errorMsg,
        variant: "destructive"
      });
    } finally {
      setAiLoading(false);
    }
  };

  const handleDistribute = () => {
    if (!rawInput.trim()) return;

    const parsed = parseAiText(rawInput, globalTopic, globalType, globalDifficulty);

    if (parsed.questions && parsed.questions.length > 0) {
      const newForms = parsed.questions.map(q => ({
        ...EMPTY_QUESTION,
        topic: globalTopic,
        type: q.type || globalType,
        difficulty: q.difficulty || globalDifficulty,
        question_text: q.question_text,
        options: (q.options && q.options.length >= 2) ? q.options : (q.type === 'true_false' ? ['True', 'False'] : ['', '', '', '']),
        correct_answer: q.correct_answer || '',
        explanation: (q.explanation || (q as Record<string, unknown>).explanation || '') as string,
        language: ((q as Record<string, unknown>).language || 'python') as string,
        input_format: ((q as Record<string, unknown>).input_format || '') as string,
        output_format: ((q as Record<string, unknown>).output_format || '') as string,
        constraints: ((q as Record<string, unknown>).constraints || '') as string,
        sample_input: ((q as Record<string, unknown>).sample_input || '') as string,
        sample_output: ((q as Record<string, unknown>).sample_output || '') as string,
        test_cases: ((q as Record<string, unknown>).test_cases || []) as TestCaseFormItem[],
        marks: q.marks || (q.difficulty === 'hard' ? 5 : q.difficulty === 'medium' ? 2 : 1),
      }));
      setBatchQuestions(prev => [...prev, ...newForms]);
      setShowRaw(false);
      toast({
        title: "Questions Distributed",
        description: `Successfully added ${parsed.questions.length} questions to the batch.`
      });
    } else {
      toast({
        title: "Parsing Failed",
        description: "Could not parse questions. Please check the raw text format.",
        variant: "destructive"
      });
    }
  };

  const handleOpenSaveWizard = () => {
    if (batchQuestions.length === 0) return;
    setIsSaveWizardOpen(true);
  };

  const handleFinalSave = async () => {
    if (!user?.id || batchQuestions.length === 0) return;
    setIsSaving(true);

    try {
      const selectedExam = exams.find(e => e.id === selectedExamId);
      const batchTopic = selectedExam ? selectedExam.title : globalTopic;

      // 1. Save Questions
      const questionsToSave = batchQuestions
        .filter(q => q.question_text.trim())
        .map(q => {
          const type = (q.type || globalType) as string;
          let finalType = 'subjective';
          if (type === 'mcq' || type === 'multiple_choice') finalType = 'multiple_choice';
          else if (type === 'true_false') finalType = 'true_false';
          else if (type === 'short' || type === 'short_answer') finalType = 'short_answer';
          else if (type === 'long' || type === 'long_answer') finalType = 'long_answer';
          else if (type === 'fill_blank') finalType = 'fill_blank';
          else if (type === 'coding') finalType = 'coding';

          return {
            topic: batchTopic,
            question_text: q.question_text,
            type: finalType,
            language: q.language || 'python',
            difficulty: q.difficulty || globalDifficulty,
            input_format: q.input_format || null,
            output_format: q.output_format || null,
            explanation: q.explanation || null,
            constraints: q.constraints || null,
            sample_input: q.sample_input || null,
            sample_output: q.sample_output || null,
            test_cases: q.test_cases || [],
            options: (finalType === 'multiple_choice' || finalType === 'true_false') ? 
              (Array.isArray(q.options) 
                ? q.options
                    .filter(o => o && o.trim())
                    .map(o => ({
                      text: o.trim(),
                      is_correct: o.trim().toLowerCase() === (q.correct_answer || '').trim().toLowerCase()
                    })) 
                : []) 
              : [],
            correct_answer: q.correct_answer || '',
            marks: Number(globalMarks) || 1,
            created_by: user.id,
            approval_status: 'approved', // Auto-approve created questions so students can access them immediately
          };
        });

      if (questionsToSave.length === 0) throw new Error("No valid questions to save");

      await createQuestion.mutateAsync(questionsToSave);

      // Auto-link Exam: Update topics & total_questions count on the Exam document in DB
      if (selectedExamId) {
        try {
          await fetchWithAuth(`/data/exams/${selectedExamId}`, {
            method: 'PATCH',
            body: JSON.stringify({
              topics: Array.from(new Set([...(selectedExam?.topics || []), batchTopic])),
              total_questions: (selectedExam?.total_questions || 0) + questionsToSave.length,
              status: 'ready',
              approval_status: 'approved'
            })
          });
        } catch (patchErr) {
          console.warn('[QuestionBankManager] Could not patch exam metadata:', patchErr);
        }
      }

      setBatchQuestions([]);
      setGlobalPrompt('');
      setIsSaveWizardOpen(false);
      toast({
        title: "Quiz Batch Submitted",
        description: "Sent to admin for approval and activation."
      });
    } catch (error) {
      toast({
        title: "Save Failed",
        description: error instanceof Error ? error.message : "Failed to save. Check console.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground text-sm">Loading question bank...</p>
      </div>
    );
  }
  return (
    <div className="space-y-8 px-1 py-2 animate-in fade-in duration-500">
    <Tabs defaultValue="bank" className="space-y-8">
      <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-6 pb-6 border-b-2 border-slate-100">
        <div className="space-y-1.5">
          <h2 className="text-3xl sm:text-4xl font-black tracking-tighter uppercase italic text-slate-900 leading-none">
            Question <span className="text-slate-900 not-italic">Repository</span>
          </h2>
          <div className="flex items-center gap-3">
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">
               {stats.total} Questions / {topics.length} Topics
             </p>
             <Badge className="bg-primary/10 text-primary border-none text-[8px] font-black px-2 py-0.5 rounded-full uppercase italic">Management Portal</Badge>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full xl:w-auto">
          <TabsList className="bg-slate-100/50 p-1.5 rounded-[1.8rem] h-16 border border-slate-200/60 shadow-inner flex-1 sm:flex-none">
          </TabsList>

          <div className="flex items-center gap-4">
            <SyncDataButton 
              onSync={onSync || (() => { refetchQuestions(); refetchExams(); })} 
              isLoading={parentLoading || isLoading} 
              className="h-16 px-6"
            />
            <Button 
               className="rounded-2xl h-16 px-8 bg-slate-900 hover:bg-black text-white text-[10px] font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-95 shadow-xl shadow-slate-200 group"
               onClick={() => onSectionChange?.('exams')}
            >
              Create Exam <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </div>
      </div>

      <TabsContent value="bank" className="space-y-8 mt-0 outline-none">

      {/* ─── Bulk Creator Section ─── */}
      <div className="grid gap-6 border rounded-xl p-6 bg-card shadow-sm">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400 flex items-center gap-2">
              <Sparkles className="h-3 w-3 text-violet-400" />
              Draft New Questions
            </h3>
          </div>

          {/* Global Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label>Topic <span className="text-destructive">*</span></Label>
              <Input
                placeholder="e.g. React Hooks"
                value={globalTopic}
                onChange={(e) => setGlobalTopic(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={globalType} onValueChange={setGlobalType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {QUESTION_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Difficulty</Label>
              <Select value={globalDifficulty} onValueChange={setGlobalDifficulty}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="easy">🟢 Easy</SelectItem>
                  <SelectItem value="medium">🟡 Medium</SelectItem>
                  <SelectItem value="hard">🔴 Hard</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Each Mark</Label>
              <Input
                type="number"
                min={1}
                value={globalMarks}
                onChange={(e) => setGlobalMarks(parseInt(e.target.value) || 1)}
              />
            </div>
            <div className="space-y-2">
              <Label>Count</Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={globalCount}
                onChange={(e) => setGlobalCount(parseInt(e.target.value) || 1)}
              />
            </div>
          </div>

          {/* AI Prompt */}
          <div className="space-y-2">
            <Label>AI Instructions <span className="text-muted-foreground text-xs">(Optional, for generation)</span></Label>
            <Textarea
              placeholder="e.g. Focus on edge cases and performance optimization..."
              rows={2}
              className="resize-none"
              value={globalPrompt}
              onChange={(e) => setGlobalPrompt(e.target.value)}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
            <Button
              variant="secondary"
              onClick={() => handleAddBlanks()}
              className="gap-2"
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span className="truncate">Add {globalCount} Blank {globalCount > 1 ? 'Questions' : 'Question'}</span>
            </Button>

            <Button
              onClick={handleAiAnalyze}
              disabled={aiLoading}
              className="gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-700 hover:to-indigo-700"
            >
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : <Brain className="h-4 w-4 shrink-0" />}
              <span className="truncate">Generate with AI</span>
            </Button>
          </div>

          {/* AI Error / Raw Output Display */}
          {/* Show error if any */}
          {aiError && (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm mt-3 animate-in fade-in">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Generation Error</p>
                <p>{aiError}</p>
              </div>
            </div>
          )}

          {/* Raw Input / AI Output Area */}
          <div className="mt-4 pt-4 border-t">
            <button
              onClick={() => setShowRaw(!showRaw)}
              className="text-sm font-medium flex items-center gap-1 mb-2 hover:underline"
            >
              {showRaw ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              AI Output / Paste Raw Text
            </button>

            {showRaw && (
              <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                <Textarea
                  value={rawInput}
                  onChange={(e) => setRawInput(e.target.value)}
                  placeholder="Paste AI output or JSON here..."
                  className="font-mono text-xs min-h-[150px]"
                />

                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-muted-foreground w-3/4">
                    Review the text above. Click 'Distribute' to parse and convert it into editable question forms below.
                  </p>
                  <Button onClick={handleDistribute} disabled={!rawInput.trim()} size="sm" className="gap-2">
                    <FileQuestion className="h-4 w-4" />
                    Distribute
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Batch Editor List ─── */}
      {batchQuestions.length > 0 && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-8">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold">New Batch ({batchQuestions.length})</h3>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setBatchQuestions([])} className="text-[10px] font-bold uppercase tracking-widest text-destructive hover:bg-rose-50 transition-all">
                Discard Current Batch
              </Button>
            </div>
          </div>

          <div className="grid gap-6">
            {batchQuestions.map((q, idx) => (
              <Card key={idx} className="relative group border-l-4 border-l-primary/50">
                <button
                  onClick={() => handleRemoveQuestion(idx)}
                  className="absolute top-2 right-2 p-2 rounded-full text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                  title="Remove Question"
                >
                  <XCircle className="h-5 w-5" />
                </button>

                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="h-6 text-[10px] px-2">{idx + 1}</Badge>
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">
                        Question Details
                      </span>
                    </div>
                  </div>

                  {/* Row 2: Question */}
                  <div className="space-y-1.5">
                    <Label>Question Text</Label>
                    <Textarea
                      value={q.question_text}
                      onChange={(e) => handleUpdateQuestion(idx, 'question_text', e.target.value)}
                      className="resize-none"
                      placeholder="What is..."
                    />
                  </div>

                  {/* Row 3: Options or True/False or Open Answer */}
                  <div className="grid grid-cols-1 gap-6">
                    {/* Multiple Choice Layout */}
                    {q.type === 'mcq' && (
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          Options
                          <Badge variant="outline" className="text-[10px] font-normal">Multiple Choice</Badge>
                        </Label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {(q.options || ['', '', '', '']).map((opt, optIdx) => (
                            <div key={optIdx} className="flex items-center gap-2">
                              <span className={cn(
                                "text-xs font-mono w-6 h-9 flex items-center justify-center rounded border bg-muted/30",
                                q.correct_answer === opt && opt.trim() ? "border-emerald-500 bg-emerald-50 text-emerald-700 font-bold" : "text-muted-foreground"
                              )}>
                                {String.fromCharCode(65 + optIdx)}
                              </span>
                              <Input
                                value={opt}
                                onChange={(e) => handleUpdateOption(idx, optIdx, e.target.value)}
                                placeholder={`Option ${String.fromCharCode(65 + optIdx)}`}
                                className={cn(
                                  "h-9 transition-colors",
                                  q.correct_answer === opt && opt.trim() ? "border-emerald-500 focus-visible:ring-emerald-500" : ""
                                )}
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className={cn(
                                  "h-8 w-8 shrink-0",
                                  q.correct_answer === opt && opt.trim() ? "text-emerald-500 hover:text-emerald-600" : "text-slate-200"
                                )}
                                onClick={() => handleUpdateQuestion(idx, 'correct_answer', opt)}
                                title="Mark as correct"
                              >
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* True / False Layout */}
                    {q.type === 'true_false' && (
                      <div className="space-y-3">
                        <Label className="flex items-center gap-2">
                          True / False Toggle
                          <Badge variant="outline" className="text-[10px] font-normal">Boolean</Badge>
                        </Label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {['True', 'False'].map((val) => (
                            <Button
                              key={val}
                              variant={q.correct_answer === val ? 'default' : 'outline'}
                              className={cn(
                                "h-14 rounded-2xl border-2 text-lg font-bold transition-all",
                                q.correct_answer === val 
                                  ? (val === 'True' ? "bg-emerald-500 hover:bg-emerald-600 border-transparent text-white" : "bg-rose-500 hover:bg-rose-600 border-transparent text-white") 
                                  : "hover:border-slate-300 bg-slate-50/50"
                              )}
                              onClick={() => {
                                handleUpdateQuestion(idx, 'correct_answer', val);
                                handleUpdateQuestion(idx, 'options', ['True', 'False']);
                              }}
                            >
                              <div className="flex items-center justify-between w-full px-2">
                                <span>{val}</span>
                                {q.correct_answer === val && <CheckCircle className="h-5 w-5" />}
                              </div>
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Open Answer Layout (Short/Long/Coding) */}
                    {(q.type !== 'mcq' && q.type !== 'true_false') && (
                      <div className="space-y-4">
                        {q.type === 'coding' && (
                          <div className="space-y-4 border-2 border-primary/20 bg-primary/5 p-4 rounded-2xl">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs font-black uppercase tracking-wider text-primary flex items-center gap-1.5">
                                <Code2 className="h-4 w-4" /> Coding Challenge Configuration
                              </Label>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-1.5">
                                <Label className="text-xs font-bold text-slate-700">Target Programming Language</Label>
                                <Select 
                                  value={q.language || 'python'} 
                                  onValueChange={(val) => handleUpdateQuestion(idx, 'language', val)}
                                >
                                  <SelectTrigger className="h-10 rounded-xl bg-white border-slate-200 font-bold text-xs uppercase">
                                    <SelectValue placeholder="Select Language" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {SUPPORTED_LANGUAGES.map(lang => (
                                      <SelectItem key={lang.value} value={lang.value} className="font-bold text-[10px] uppercase tracking-wider">
                                        {lang.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="space-y-1.5">
                                <Label className="text-xs font-bold text-slate-700">Constraints</Label>
                                <Input
                                  value={q.constraints || ''}
                                  onChange={(e) => handleUpdateQuestion(idx, 'constraints', e.target.value)}
                                  placeholder="e.g. 1 <= price <= 100000, 1 <= quantity <= 100"
                                  className="h-10 rounded-xl bg-white border-slate-200 font-mono text-xs"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-1.5">
                                <Label className="text-xs font-bold text-slate-700">Input Format</Label>
                                <Textarea
                                  value={q.input_format || ''}
                                  onChange={(e) => handleUpdateQuestion(idx, 'input_format', e.target.value)}
                                  rows={3}
                                  className="bg-white border-slate-200 text-xs"
                                  placeholder="Line 1: price (float)&#10;Line 2: quantity (int)..."
                                />
                              </div>

                              <div className="space-y-1.5">
                                <Label className="text-xs font-bold text-slate-700">Output Format</Label>
                                <Textarea
                                  value={q.output_format || ''}
                                  onChange={(e) => handleUpdateQuestion(idx, 'output_format', e.target.value)}
                                  rows={3}
                                  className="bg-white border-slate-200 text-xs"
                                  placeholder="Print Total Amount, Discount, Final Amount..."
                                />
                              </div>
                            </div>

                            {/* Test Cases Editor */}
                            <div className="space-y-3 pt-2">
                              <div className="flex items-center justify-between">
                                <Label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                                  <TerminalIcon className="h-4 w-4 text-emerald-600" /> Test Cases & Example Inputs/Outputs
                                </Label>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  type="button"
                                  onClick={() => {
                                    const currentTc = q.test_cases || [];
                                    handleUpdateQuestion(idx, 'test_cases', [
                                      ...currentTc,
                                      { input: '', expected_output: '', explanation: '', is_hidden: false }
                                    ]);
                                  }}
                                  className="h-7 text-xs rounded-lg font-bold bg-white text-primary border-primary/30 hover:bg-primary/5"
                                >
                                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Test Case
                                </Button>
                              </div>

                              {(q.test_cases || [{ input: q.sample_input || '', expected_output: q.sample_output || '', is_hidden: false }]).map((tc, tcIdx) => (
                                <div key={tcIdx} className="bg-white p-3 rounded-xl border border-slate-200 space-y-3">
                                  <div className="flex items-center justify-between">
                                    <Badge variant="outline" className="text-[10px] font-bold">
                                      Test Case #{tcIdx + 1} {tc.is_hidden ? '(Hidden)' : '(Sample)'}
                                    </Badge>
                                    <div className="flex items-center gap-2">
                                      <label className="flex items-center gap-1 text-[10px] text-slate-600 cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={!!tc.is_hidden}
                                          onChange={(e) => {
                                            const updatedTc = [...(q.test_cases || [])];
                                            if (updatedTc[tcIdx]) {
                                              updatedTc[tcIdx].is_hidden = e.target.checked;
                                              handleUpdateQuestion(idx, 'test_cases', updatedTc);
                                            }
                                          }}
                                          className="rounded text-primary"
                                        />
                                        Is Hidden Test Case?
                                      </label>
                                      {((q.test_cases || []).length > 1) && (
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          type="button"
                                          className="h-6 w-6 text-rose-500 hover:text-rose-700"
                                          onClick={() => {
                                            const updatedTc = (q.test_cases || []).filter((_, i) => i !== tcIdx);
                                            handleUpdateQuestion(idx, 'test_cases', updatedTc);
                                          }}
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      )}
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                      <Label className="text-[10px] font-bold text-slate-500">Expected Input</Label>
                                      <Textarea
                                        value={tc.input || ''}
                                        onChange={(e) => {
                                          const updatedTc = [...(q.test_cases || [])];
                                          if (!updatedTc[tcIdx]) updatedTc[tcIdx] = { input: '', expected_output: '' };
                                          updatedTc[tcIdx].input = e.target.value;
                                          handleUpdateQuestion(idx, 'test_cases', updatedTc);
                                        }}
                                        rows={2}
                                        placeholder="500&#10;4"
                                        className="font-mono text-xs bg-slate-900 text-emerald-400 border-slate-800"
                                      />
                                    </div>

                                    <div className="space-y-1">
                                      <Label className="text-[10px] font-bold text-slate-500">Expected Output</Label>
                                      <Textarea
                                        value={tc.expected_output || ''}
                                        onChange={(e) => {
                                          const updatedTc = [...(q.test_cases || [])];
                                          if (!updatedTc[tcIdx]) updatedTc[tcIdx] = { input: '', expected_output: '' };
                                          updatedTc[tcIdx].expected_output = e.target.value;
                                          handleUpdateQuestion(idx, 'test_cases', updatedTc);
                                        }}
                                        rows={2}
                                        placeholder="Total Amount: 2000&#10;Discount: 200&#10;Final Amount: 1800"
                                        className="font-mono text-xs bg-slate-900 text-sky-300 border-slate-800"
                                      />
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2">
                            Ideal Answer Solution Code / Logic
                            <Badge variant="outline" className="text-[10px] font-normal tracking-wide">
                              {String(q.type || 'short').toUpperCase().replace('_', ' ')}
                            </Badge>
                          </Label>
                          <Textarea
                            value={q.correct_answer}
                            onChange={(e) => handleUpdateQuestion(idx, 'correct_answer', e.target.value)}
                            className={cn(
                              "min-h-[140px] font-mono leading-relaxed",
                              q.type === 'coding' ? "bg-slate-900 text-emerald-400 border-slate-800" : "bg-slate-50 border-slate-200"
                            )}
                            placeholder={q.type === 'coding' ? "# Write solution code here..." : "Enter the correct answer..."}
                          />
                        </div>
                      </div>
                    )}

                    <div className="space-y-2 mt-4 bg-muted/20 p-3 rounded-lg border border-slate-100">
                      <Label className="text-[10px] uppercase tracking-widest text-slate-400">Contextual Explanation</Label>
                      <Textarea
                        value={q.explanation}
                        onChange={(e) => handleUpdateQuestion(idx, 'explanation', e.target.value)}
                        rows={2}
                        className="resize-none text-xs border-0 bg-transparent focus-visible:ring-0 p-0"
                        placeholder="Add reasoning or reference link..."
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex flex-col lg:flex-row justify-between items-center gap-6 py-6 sm:py-8 bg-slate-50/50 border-2 border-dashed border-slate-100 rounded-3xl p-4 sm:p-8 shadow-inner mt-8 sm:mt-12">
            <div className="flex flex-col gap-4 w-full lg:w-auto">
              <div className="flex items-center gap-2">
                <Plus className="h-4 w-4 text-primary" />
                <span className="text-[10px] font-black text-slate-800 uppercase tracking-[0.2em]">Quick Add Questions</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => handleAddBlanks('mcq')} 
                  className="rounded-xl h-12 px-5 border-slate-200 shadow-sm hover:border-primary hover:bg-primary/5 transition-all text-[10px] font-bold uppercase tracking-widest"
                >
                  <FileQuestion className="h-4 w-4 mr-2 text-indigo-500" /> + MCQ
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => handleAddBlanks('true_false')} 
                  className="rounded-xl h-12 px-5 border-slate-200 shadow-sm hover:border-emerald-500 hover:bg-emerald-50 transition-all text-[10px] font-bold uppercase tracking-widest"
                >
                  <CheckCircle className="h-4 w-4 mr-2 text-emerald-500" /> + T/F
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => handleAddBlanks('short')} 
                  className="rounded-xl h-12 px-5 border-slate-200 shadow-sm hover:border-amber-500 hover:bg-amber-50 transition-all text-[10px] font-bold uppercase tracking-widest"
                >
                  <ClipboardList className="h-4 w-4 mr-2 text-amber-500" /> + Short
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => handleAddBlanks('long')} 
                  className="rounded-xl h-12 px-5 border-slate-200 shadow-sm hover:border-rose-500 hover:bg-rose-50 transition-all text-[10px] font-bold uppercase tracking-widest"
                >
                  <Plus className="h-4 w-4 mr-2 text-rose-500" /> + Long
                </Button>
              </div>
            </div>

            <Button
              onClick={handleOpenSaveWizard}
              disabled={isSaving}
              size="lg"
              className="w-full lg:w-auto gap-3 h-16 px-12 text-lg font-black italic tracking-tighter bg-slate-900 hover:bg-black text-white shadow-2xl shadow-slate-900/20 border-0 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              FINALIZE BATCH <ArrowRight className="h-6 w-6" />
            </Button>
          </div>
          <Separator className="my-8" />
        </div>
      )
      }

      {/* ─── Topic Summary & Filters ─── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <Layers className="h-5 w-5 text-indigo-500" />
              Question Repository
            </h3>
            <p className="text-sm text-muted-foreground">Select a batch to explore questions and solutions</p>
          </div>
        </div>

        {/* ── Topic Breakdown ── */}
        {topicStats.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
             {topicStats.map((s) => {
               return (
                 <Card
                   key={s.topic}
                   className={cn(
                     "hover:shadow-lg transition-all cursor-pointer border-2 relative overflow-hidden group",
                     filterTopic === s.topic ? "border-primary bg-primary/[0.03]" : "border-muted"
                   )}
                   onClick={() => setFilterTopic(filterTopic === s.topic ? 'all' : s.topic)}
                 >
                   <CardContent className="p-6 space-y-4">
                     <div className="flex items-start justify-between gap-3">
                       <div className="space-y-1">
                         <p className="font-bold text-lg leading-tight group-hover:text-primary transition-colors">{s.topic}</p>
                         <p className="text-xs text-muted-foreground line-clamp-2">
                           Curated batch of questions for practice and assessment.
                         </p>
                       </div>
                       <Badge variant="outline" className="bg-background shadow-sm shrink-0">{s.total}</Badge>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t">
                      <DifficultyBar {...s} />
                    </div>
                  </CardContent>
                  {filterTopic === s.topic && (
                    <div className="absolute top-0 right-0 p-1">
                      <CheckCircle className="h-4 w-4 text-primary" />
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Questions Table ── */}
      <Card className="shadow-sm">
        <CardHeader className="px-6 pt-5 pb-4 border-b">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 shrink-0">
                <div className="p-2 bg-primary/10 rounded-[1.25rem] w-fit">
                  <Brain className="h-6 w-6 sm:h-7 sm:w-7 text-primary" />
                </div>
                <div className="flex flex-col">
                  <CardTitle className="text-xl sm:text-2xl font-black italic tracking-tighter leading-none text-slate-900">
                    BROWSER
                  </CardTitle>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-[9px] sm:text-[10px] font-mono h-4 sm:h-5 px-1.5 sm:px-2 bg-slate-900 text-white border-none">{filteredQuestions.length} Questions</Badge>
                    <div className="h-1 w-1 rounded-full bg-slate-200" />
                    <span className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-800 tracking-widest">Question Base</span>
                  </div>
                </div>
              </div>

              {/* Filters Container */}
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full xl:w-auto">
                {/* Search Input */}
                <div className="relative flex-1 min-w-[200px] sm:min-w-[240px] lg:min-w-[300px]">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search context or keywords..."
                    className="pl-10 h-10 sm:h-11 w-full rounded-xl bg-slate-50 border-slate-100 hover:border-slate-200 focus:bg-white transition-all text-xs sm:text-sm font-medium"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                {/* Select Controls Group */}
                <div className="flex items-center gap-2 shrink-0">
                  <Select value={filterType} onValueChange={setFilterType}>
                    <SelectTrigger className="h-10 sm:h-11 w-[110px] sm:w-[130px] rounded-xl bg-slate-50 border-slate-100 font-bold text-[9px] sm:text-[10px] uppercase tracking-widest">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All types</SelectItem>
                      {QUESTION_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value} className="text-[10px] uppercase font-bold tracking-wider">{t.label.split('(')[0]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={filterDifficulty} onValueChange={setFilterDifficulty}>
                    <SelectTrigger className="h-10 sm:h-11 w-[110px] sm:w-[130px] rounded-xl bg-slate-50 border-slate-100 font-bold text-[9px] sm:text-[10px] uppercase tracking-widest">
                      <SelectValue placeholder="Level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All levels</SelectItem>
                      <SelectItem value="easy" className="text-emerald-600 font-bold uppercase text-[10px]">Easy</SelectItem>
                      <SelectItem value="medium" className="text-amber-600 font-bold uppercase text-[10px]">Medium</SelectItem>
                      <SelectItem value="hard" className="text-rose-600 font-bold uppercase text-[10px]">Hard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {filterTopic !== 'all' && (
              <div className="flex items-center gap-2 px-4 py-2 bg-primary/5 border border-primary/10 rounded-lg animate-in fade-in slide-in-from-left-2">
                <Layers className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Filtering by Topic:</span>
                <Badge className="bg-primary hover:bg-primary transition-all px-3 py-1 text-xs">
                  {filterTopic}
                </Badge>
                <div className="flex items-center gap-1.5 ml-2 border-l pl-3">
                  <span className="text-xs text-muted-foreground">{filteredQuestions.length} Items</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFilterTopic('all')}
                  className="ml-auto h-8 px-3 text-xs font-semibold hover:bg-destructive/10 hover:text-destructive gap-1.5 transition-all"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  View All
                </Button>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="px-6 pb-6">
          {filteredQuestions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center space-y-3">
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
                <FileQuestion className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="font-medium">No questions found</p>
              <p className="text-sm text-muted-foreground">
                Try adjusting your filters or use the creator above.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredQuestions.map((q, idx) => {
                const isExpanded = expandedId === (q.id || q._id);
                const opts = Array.isArray(q.options) ? q.options : [];

                return (
                  <div
                    key={q.id || q._id}
                    className="rounded-xl border bg-card hover:bg-accent/30 transition-colors"
                  >
                    {/* Row */}
                    <div
                      className="flex items-start gap-3 sm:gap-4 p-3 sm:p-4 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : (q.id || q._id) as string)}
                    >
                      {/* Index */}
                      <span className="text-[10px] sm:text-xs text-muted-foreground font-mono mt-0.5 w-5 sm:w-6 text-right shrink-0">
                        {idx + 1}
                      </span>

                      {/* Content */}
                      <div className="flex-1 space-y-1.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                          <QuestionTypeIcon type={q.type} />
                          <Badge
                            variant={DIFFICULTY_BADGE_VARIANT[q.difficulty as keyof typeof DIFFICULTY_BADGE_VARIANT] ?? 'secondary'}
                            className="text-[8px] sm:text-[9px] uppercase tracking-tighter h-3.5 sm:h-4 px-1"
                          >
                            {q.difficulty}
                          </Badge>
                          <Badge 
                            variant="outline" 
                            className={cn(
                              "text-[8px] sm:text-[9px] uppercase tracking-tighter h-3.5 sm:h-4 px-1 border-none",
                              q.approval_status === 'approved' ? "bg-emerald-50 text-emerald-600" : q.approval_status === 'rejected' ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600"
                            )}
                          >
                            {q.approval_status || 'pending'}
                          </Badge>
                          <span className="text-[9px] sm:text-[10px] text-muted-foreground bg-muted/50 px-1.5 rounded font-bold uppercase">
                            {q.marks ?? 1} Marks
                          </span>
                        </div>
                        <p className={cn('text-sm sm:text-lg font-semibold leading-snug sm:leading-relaxed tracking-tight text-foreground/90 transition-all', !isExpanded && 'line-clamp-2 sm:line-clamp-1')}>
                          {q.question_text}
                        </p>
                        {!isExpanded && (
                          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                            <span className="text-[9px] sm:text-[10px] text-muted-foreground font-black uppercase tracking-widest truncate max-w-[120px] sm:max-w-none">CAT: {q.topic}</span>
                            <div className="h-0.5 w-0.5 sm:h-1 sm:w-1 rounded-full bg-muted-foreground/30" />
                            <span className="text-[9px] sm:text-[10px] text-primary/70 font-black uppercase tracking-tighter">Expand</span>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div
                        className="flex items-center gap-1 sm:gap-1.5 shrink-0 ml-auto"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 sm:h-8 sm:w-8"
                          onClick={() => setExpandedId(isExpanded ? null : (q.id || q._id) as string)}
                        >
                          {isExpanded
                            ? <ChevronUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            : <ChevronDown className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 sm:h-8 sm:w-8 hover:bg-destructive/10"
                          onClick={() => deleteQuestion.mutate((q.id || q._id) as string)}
                        >
                          <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>

                    {/* Expanded Detail */}
                    {isExpanded && (
                      <div className="px-4 sm:px-6 pb-4 sm:pb-5 pt-0 border-t mt-0 space-y-3">
                        {/* MCQ Options - Student Interface Look */}
                        {opts.length > 0 && (
                          <div className="space-y-2 mt-4">
                            <p className="text-[9px] sm:text-[10px] uppercase font-bold text-muted-foreground tracking-widest pl-1">Options Preview</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                              {opts.map((opt, i) => {
                                const isCorrect = opt ? (typeof opt === 'object' ? (opt as Record<string, unknown>).is_correct === true : String(opt).trim() === String(q.correct_answer).trim()) : false;
                                const optText = opt ? (typeof opt === 'object' ? String((opt as Record<string, unknown>).text || '') : String(opt)) : '';
                                
                                return (
                                  <div
                                    key={i}
                                    className={cn(
                                      "flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 rounded-xl text-xs sm:text-sm border-2 transition-all",
                                      isCorrect
                                        ? "bg-emerald-50 border-emerald-500/30 text-emerald-900 shadow-sm shadow-emerald-500/10"
                                        : "bg-background border-muted hover:border-muted-foreground/20"
                                    )}
                                  >
                                    <div className={cn(
                                      "h-5 w-5 sm:h-6 sm:w-6 rounded-full flex items-center justify-center text-[9px] sm:text-[10px] font-bold border",
                                      isCorrect ? "bg-emerald-500 text-white border-emerald-500" : "bg-muted border-muted-foreground/20"
                                    )}>
                                      {String.fromCharCode(65 + i)}
                                    </div>
                                    <span className="flex-1 font-medium truncate">{optText}</span>
                                    {isCorrect && (
                                      <div className="flex items-center gap-1 text-[9px] sm:text-[10px] font-bold text-emerald-600">
                                        <span className="hidden xs:inline">CORRECT</span>
                                        <CheckCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Explanation & Details */}
                        {(q.explanation || q.correct_answer) && (
                          <div className="mt-4 p-4 rounded-xl bg-indigo-50/50 border border-indigo-100/50 space-y-2">
                            <div className="flex items-center gap-2 text-indigo-700">
                              <Sparkles className="h-4 w-4" />
                              <span className="text-xs font-bold uppercase tracking-wider">Solution Insights</span>
                            </div>
                            {opts.length === 0 && q.correct_answer && (
                              <p className="text-sm font-semibold">
                                Correct Answer: <span className="text-emerald-600">{String(q.correct_answer)}</span>
                              </p>
                            )}
                            {q.explanation && (
                              <p className="text-sm text-indigo-900/80 leading-relaxed italic">
                                &ldquo;{q.explanation}&rdquo;
                              </p>
                            )}
                          </div>
                        )}

                        {/* Explanation */}
                        {q.explanation && (
                          <div className="flex items-start gap-2 mt-1 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
                            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 shrink-0 mt-0.5">
                              💡 Explanation:
                            </span>
                            <p className="text-xs text-blue-700 dark:text-blue-300">{q.explanation}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {filteredQuestions.length > 10 && (
                <p className="text-center text-sm text-muted-foreground pt-2">
                  Showing all {filteredQuestions.length} questions
                </p>
              )}
            </div>
          )}
          <div />
        </CardContent>
      </Card>

      {/* ─── Save Wizard Dialog ─── */}
      <Dialog open={isSaveWizardOpen} onOpenChange={setIsSaveWizardOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[92vh] overflow-hidden p-0 border-0 rounded-[2rem] shadow-2xl flex flex-col bg-white">
          {/* Header */}
          <div className="px-8 pt-8 pb-6 border-b border-slate-100">
            <DialogTitle className="text-2xl font-black tracking-tighter uppercase text-slate-900">
              Finalize Batch
            </DialogTitle>
            <DialogDescription className="text-[11px] font-semibold text-slate-400 uppercase tracking-[0.28em] mt-1">
              Attach draft questions to an active exam schedule
            </DialogDescription>
          </div>

          {/* Exam Grid */}
          <div className="flex-1 overflow-y-auto p-6">
            {exams.length === 0 ? (
              <div className="py-20 text-center border-2 border-dashed border-slate-100 rounded-[2rem] bg-slate-50/50">
                <p className="text-sm font-black text-slate-300 uppercase tracking-widest italic">No Active Schedulings Found</p>
                <Button variant="link" className="text-primary mt-2 uppercase text-[10px] font-bold tracking-widest" onClick={() => onSectionChange?.('exams')}>Create New Schedule</Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {exams.map((exam) => {
                  const isSelected = selectedExamId === exam.id;
                  return (
                    <div
                      key={exam.id}
                      onClick={() => setSelectedExamId(exam.id)}
                      className="group relative cursor-pointer rounded-[1.5rem] border-2 border-slate-100 bg-white overflow-hidden hover:border-slate-200 hover:shadow-lg transition-all duration-300"
                    >
                      {/* Poster — 1080x720 aspect (3:2) */}
                      <div className="relative w-full" style={{ aspectRatio: '3/2' }}>
                        {exam.assigned_image ? (
                          <img
                            src={exam.assigned_image}
                            className="absolute inset-0 w-full h-full object-cover"
                            alt={exam.title}
                          />
                        ) : (
                          <div className="absolute inset-0 bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                            <ShieldCheck className="h-10 w-10 text-slate-300" />
                          </div>
                        )}

                        {/* Hover Popup Overlay - no color change */}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-start justify-end p-3 pointer-events-none">
                          <p className="text-[10px] font-black text-white uppercase tracking-widest leading-tight line-clamp-2">{exam.title}</p>
                          {exam.scheduled_date && (
                            <p className="text-[9px] text-white/70 font-medium mt-0.5">
                              {new Date(exam.scheduled_date).toLocaleDateString()}
                            </p>
                          )}
                          {exam.total_marks && (
                            <p className="text-[9px] text-white/70 font-medium">{exam.total_marks} marks</p>
                          )}
                        </div>

                        {/* Selected Radio indicator */}
                        <div className={cn(
                          "absolute top-2.5 right-2.5 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all duration-200 bg-white",
                          isSelected ? "border-slate-900" : "border-white/70"
                        )}>
                          {isSelected && (
                            <div className="h-2.5 w-2.5 rounded-full bg-slate-900" />
                          )}
                        </div>
                      </div>

                      {/* Title below image */}
                      <div className="px-3 py-2.5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-700 truncate">{exam.title}</p>
                        <p className="text-[9px] text-slate-400 font-medium">#{exam.id.slice(0, 6)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <Button variant="ghost" className="h-12 w-full sm:w-auto px-8 rounded-xl font-black uppercase tracking-widest text-[10px] text-slate-400 hover:text-slate-900" onClick={() => setIsSaveWizardOpen(false)}>
              Back to Editor
            </Button>
            <Button
              className="flex-1 h-12 rounded-xl font-black text-[11px] uppercase tracking-[0.25em] gap-3 bg-slate-900 hover:bg-black text-white shadow-lg transition-all active:scale-95"
              onClick={handleFinalSave}
              disabled={isSaving || !selectedExamId}
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin text-white/50" /> : <Plus className="h-4 w-4" />}
              + Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TabsContent>

    <TabsContent value="final-batches" className="mt-0 outline-none">
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">

        {exams.filter(e => e.approval_status === 'approved').length === 0 ? (
          <div className="col-span-full py-20 text-center border-2 border-dashed border-slate-100 rounded-[3rem] bg-slate-50/50">
             <History className="h-12 w-12 text-slate-200 mx-auto mb-4" />
             <h3 className="text-xl font-bold text-slate-900 uppercase tracking-widest italic">No Final Batches Pending</h3>
             <p className="text-sm text-slate-400 font-bold uppercase tracking-widest mt-2">Approve scheduled exams to see them here.</p>
          </div>
        ) : (
          exams.filter(e => e.approval_status === 'approved').map((exam) => {
            const currentExamQuestions = filteredQuestions.filter(q => q.topic === exam.title).length;
            return (
              <Card key={exam.id} className="rounded-[2.5rem] overflow-hidden border-2 border-slate-50 hover:border-primary/20 transition-all hover:shadow-2xl group relative bg-white">
                <div className="aspect-video relative overflow-hidden bg-slate-100">
                  {exam.assigned_image ? (
                    <img src={exam.assigned_image} className="h-full w-full object-cover grayscale-[0.5] group-hover:grayscale-0 transition-all duration-700" alt="" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center">
                       <ShieldCheck className="h-12 w-12 text-slate-200" />
                    </div>
                  )}
                  <div className="absolute top-4 right-4 animate-in fade-in zoom-in duration-500">
                    <Badge className="bg-emerald-500 text-white border-none text-[8px] font-black uppercase tracking-widest px-3 py-1.5 h-6 rounded-full shadow-lg shadow-emerald-500/20 flex items-center gap-1.5">
                      <CheckCircle2 className="h-3 w-3" /> APPROVED
                    </Badge>
                  </div>
                </div>
                
                <CardContent className="p-8 space-y-6">
                  <div className="space-y-1.5">
                      <h4 className="text-xl font-black text-slate-900 uppercase tracking-tighter truncate leading-none">{exam.title}</h4>
                      <div className="flex items-center gap-3">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                          <Calendar className="h-3 w-3" />
                           {exam.scheduled_date ? new Date(exam.scheduled_date).toLocaleDateString() : 'N/A'}
                        </p>
                        <div className="h-1 w-1 rounded-full bg-slate-200" />
                        <Badge variant="outline" className="text-[8px] font-black uppercase tracking-tighter h-4 px-1.5 rounded-sm">{exam.exam_type}</Badge>
                      </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1 group-hover:bg-primary/5 transition-colors">
                         <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Question Bank</p>
                         <p className="text-2xl font-black text-slate-900 leading-none">
                            {currentExamQuestions}
                            <span className="text-[10px] text-slate-300 ml-1 font-bold">Files</span>
                         </p>
                      </div>
                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1 group-hover:bg-violet-50 transition-colors">
                         <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Total Weight</p>
                         <p className="text-2xl font-black text-slate-900 leading-none">{exam.total_marks || 100}</p>
                      </div>
                  </div>

                  <Button 
                      onClick={() => {
                        setSelectedExamId(exam.id);
                        setGlobalTopic(exam.title);
                        toast({ title: "Protocol Initiated", description: `You can now add questions to ${exam.title}` });
                      }}
                      className="w-full h-14 rounded-2xl bg-slate-900 hover:bg-black text-white text-[10px] font-black uppercase tracking-widest gap-3 shadow-xl shadow-slate-200 active:scale-95 transition-all"
                  >
                     UPLOAD QUESTIONS <Plus className="h-4 w-4" />
                  </Button>
                </CardContent>

                {currentExamQuestions > 0 && (
                  <div className="absolute bottom-24 right-8 transform translate-y-1/2">
                     <div className="h-14 w-14 rounded-full bg-emerald-500 border-4 border-white shadow-xl flex items-center justify-center text-white ring-8 ring-emerald-500/10">
                        <CheckCircle2 className="h-6 w-6" />
                     </div>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>
    </TabsContent>
  </Tabs>
</div>
);
}
