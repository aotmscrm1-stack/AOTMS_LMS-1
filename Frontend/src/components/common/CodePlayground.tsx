import React, { useRef, useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { 
  Play, 
  RotateCcw, 
  Trash2, 
  Terminal as TerminalIcon, 
  Code2, 
  Loader2, 
  Maximize2, 
  Minimize2,
  Sparkles,
  CheckCircle2,
  Keyboard,
  Sliders,
  FileCode2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface LanguageDef {
  id: string;
  name: string;
  aliases: string[];
  monacoLang: string;
  defaultCode: string;
}

export const SUPPORTED_LANGUAGES: LanguageDef[] = [
  {
    id: 'python',
    name: 'Python 3',
    aliases: ['python', 'python3', 'py'],
    monacoLang: 'python',
    defaultCode: '# Write your Python solution here\ndef main():\n    print("Hello from Python!")\n\nif __name__ == "__main__":\n    main()\n'
  },
  {
    id: 'javascript',
    name: 'JavaScript (Node.js)',
    aliases: ['javascript', 'js', 'node'],
    monacoLang: 'javascript',
    defaultCode: '// Write your JavaScript solution here\nfunction main() {\n    console.log("Hello from JavaScript!");\n}\n\nmain();\n'
  },
  {
    id: 'typescript',
    name: 'TypeScript',
    aliases: ['typescript', 'ts'],
    monacoLang: 'typescript',
    defaultCode: '// Write your TypeScript solution here\nconst greeting: string = "Hello from TypeScript!";\nconsole.log(greeting);\n'
  },
  {
    id: 'cpp',
    name: 'C++',
    aliases: ['cpp', 'c++', 'g++'],
    monacoLang: 'cpp',
    defaultCode: '#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello from C++!" << endl;\n    return 0;\n}\n'
  },
  {
    id: 'c',
    name: 'C',
    aliases: ['c', 'gcc'],
    monacoLang: 'c',
    defaultCode: '#include <stdio.h>\n\nint main() {\n    printf("Hello from C!\\n");\n    return 0;\n}\n'
  },
  {
    id: 'java',
    name: 'Java',
    aliases: ['java', 'openjdk'],
    monacoLang: 'java',
    defaultCode: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello from Java!");\n    }\n}\n'
  },
  {
    id: 'csharp',
    name: 'C# (.NET)',
    aliases: ['csharp', 'c#', 'dotnet'],
    monacoLang: 'csharp',
    defaultCode: 'using System;\n\nclass Program {\n    static void Main() {\n        Console.WriteLine("Hello from C#!");\n    }\n}\n'
  },
  {
    id: 'sql',
    name: 'SQL (SQLite)',
    aliases: ['sql', 'sqlite', 'sqlite3'],
    monacoLang: 'sql',
    defaultCode: '-- Write your SQL queries here\nCREATE TABLE students (id INT, name TEXT);\nINSERT INTO students VALUES (1, "LITAM Student");\nSELECT * FROM students;\n'
  },
  {
    id: 'go',
    name: 'Go',
    aliases: ['go', 'golang'],
    monacoLang: 'go',
    defaultCode: 'package main\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello from Go!")\n}\n'
  },
  {
    id: 'rust',
    name: 'Rust',
    aliases: ['rust', 'rs'],
    monacoLang: 'rust',
    defaultCode: 'fn main() {\n    println!("Hello from Rust!");\n}\n'
  },
  {
    id: 'php',
    name: 'PHP',
    aliases: ['php'],
    monacoLang: 'php',
    defaultCode: '<?php\necho "Hello from PHP!\\n";\n'
  },
  {
    id: 'ruby',
    name: 'Ruby',
    aliases: ['ruby', 'rb'],
    monacoLang: 'ruby',
    defaultCode: 'puts "Hello from Ruby!"\n'
  },
  {
    id: 'kotlin',
    name: 'Kotlin',
    aliases: ['kotlin', 'kt'],
    monacoLang: 'kotlin',
    defaultCode: 'fun main() {\n    println("Hello from Kotlin!")\n}\n'
  },
  {
    id: 'swift',
    name: 'Swift',
    aliases: ['swift'],
    monacoLang: 'swift',
    defaultCode: 'print("Hello from Swift!")\n'
  }
];

export const detectSmartLanguage = (inputLang?: string, questionText?: string): string => {
  // 1. Scan question text for explicit language mentions first
  if (questionText) {
    const qLower = questionText.toLowerCase();
    if (qLower.includes('python')) return 'python';
    if (qLower.includes('c++') || qLower.includes('cpp')) return 'cpp';
    if (qLower.includes('java ') || qLower.includes('java\n') || qLower.includes('in java') || qLower.includes('java class')) return 'java';
    if (qLower.includes('c#') || qLower.includes('csharp')) return 'csharp';
    if (qLower.includes('sql') || qLower.includes('sqlite') || qLower.includes('select ') || qLower.includes('table')) return 'sql';
    if (qLower.includes('typescript') || qLower.includes(' ts ')) return 'typescript';
    if (qLower.includes('rust')) return 'rust';
    if (qLower.includes('golang') || qLower.includes('go lang')) return 'go';
    if (qLower.includes('php')) return 'php';
    if (qLower.includes('ruby')) return 'ruby';
    if (qLower.includes('kotlin')) return 'kotlin';
    if (qLower.includes('swift')) return 'swift';
    if (qLower.includes('c program') || qLower.includes('in c ') || qLower.includes('c language')) return 'c';
    if (qLower.includes('javascript') || qLower.includes('js function')) return 'javascript';
  }

  // 2. Try explicit input language if provided
  if (inputLang) {
    const clean = inputLang.toLowerCase().trim();
    const found = SUPPORTED_LANGUAGES.find(
      (l) => l.id === clean || l.aliases.includes(clean)
    );
    if (found) return found.id;
  }

  return 'python';
};

export const normalizeLanguageId = (input?: string): string => {
  return detectSmartLanguage(input);
};

interface CodePlaygroundProps {
  initialLanguage?: string;
  questionText?: string;
  value: string;
  onChange: (val: string | undefined) => void;
  output?: string;
  onRunCode?: (lang: string, code: string, stdin?: string) => Promise<void>;
  isRunning?: boolean;
  readOnly?: boolean;
  className?: string;
}

export const CodePlayground: React.FC<CodePlaygroundProps> = ({
  initialLanguage = 'python',
  questionText = '',
  value,
  onChange,
  output = '',
  onRunCode,
  isRunning = false,
  readOnly = false,
  className,
}) => {
  const [selectedLanguage, setSelectedLanguage] = useState<string>(() =>
    detectSmartLanguage(initialLanguage, questionText)
  );
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [stdin, setStdin] = useState<string>('');
  const [activeRightTab, setActiveRightTab] = useState<'terminal' | 'stdin'>('terminal');

  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  // Re-fit terminal when switching to terminal tab
  useEffect(() => {
    if (activeRightTab === 'terminal') {
      const timer = setTimeout(() => fitAddonRef.current?.fit(), 80);
      return () => clearTimeout(timer);
    }
  }, [activeRightTab]);

  // Sync selected language when question target language changes
  useEffect(() => {
    const target = detectSmartLanguage(initialLanguage, questionText);
    setSelectedLanguage(target);

    // If code is empty or matching another language template, set default code for target language
    const langObj = SUPPORTED_LANGUAGES.find((l) => l.id === target);
    if (langObj && (!value || value.trim() === '')) {
      onChange(langObj.defaultCode);
    }
  }, [initialLanguage, questionText]);

  // Initialize xterm.js Terminal
  useEffect(() => {
    if (terminalRef.current && !xtermRef.current) {
      const term = new Terminal({
        theme: {
          background: '#090d16',
          foreground: '#f8fafc',
          cursor: '#38bdf8',
          selectionBackground: '#334155',
          black: '#0f172a',
          red: '#f87171',
          green: '#4ade80',
          yellow: '#facc15',
          blue: '#60a5fa',
          magenta: '#c084fc',
          cyan: '#38bdf8',
          white: '#ffffff'
        },
        fontSize: 13,
        fontFamily: 'Consolas, "Fira Code", Monaco, "Courier New", monospace',
        cursorBlink: true,
        scrollback: 2000,
        convertEol: true,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(terminalRef.current);

      // Timeout allows DOM container layout to calculate exact pixel dimensions
      setTimeout(() => fitAddon.fit(), 100);

      xtermRef.current = term;
      fitAddonRef.current = fitAddon;

      term.writeln('\x1b[1;36m=== LMS Interactive Code Execution Terminal ===\x1b[0m');
      term.writeln('\x1b[90mPowered by Monaco Editor + xterm.js + Piston Engine\x1b[0m');
      term.writeln('');

      const handleResize = () => fitAddonRef.current?.fit();
      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        term.dispose();
        xtermRef.current = null;
      };
    }
  }, []);

  // Update output in terminal when output prop changes
  useEffect(() => {
    if (xtermRef.current) {
      if (output) {
        setActiveRightTab('terminal');
        xtermRef.current.clear();
        xtermRef.current.writeln('\x1b[1;32m[Execution Completed]\x1b[0m');

        if (stdin.trim()) {
          xtermRef.current.writeln('\x1b[90m┌─ Standard Input (stdin):\x1b[0m');
          stdin.trim().split('\n').forEach((l) => {
            xtermRef.current?.writeln(`\x1b[90m│\x1b[0m \x1b[36m${l}\x1b[0m`);
          });
          xtermRef.current.writeln('\x1b[90m└────────────────────────────────────────\x1b[0m');
        }

        const lines = output.split('\n');
        lines.forEach((line) => {
          if (
            line.toLowerCase().includes('error') ||
            line.toLowerCase().includes('exception') ||
            line.toLowerCase().includes('traceback')
          ) {
            xtermRef.current?.writeln(`\x1b[1;31m${line}\x1b[0m`);
          } else if (line.toLowerCase().includes('warn')) {
            xtermRef.current?.writeln(`\x1b[1;33m${line}\x1b[0m`);
          } else {
            xtermRef.current?.writeln(line);
          }
        });

        // Trigger refit after writing content
        setTimeout(() => fitAddonRef.current?.fit(), 50);
      }
    }
  }, [output]);

  // Refit terminal on fullscreen toggle
  useEffect(() => {
    const timer = setTimeout(() => {
      fitAddonRef.current?.fit();
    }, 150);
    return () => clearTimeout(timer);
  }, [isFullScreen]);

  const handleClearTerminal = () => {
    if (xtermRef.current) {
      xtermRef.current.clear();
      xtermRef.current.writeln('\x1b[90mTerminal cleared. Ready for code execution...\x1b[0m');
    }
  };

  const handleResetCode = () => {
    const langObj = SUPPORTED_LANGUAGES.find((l) => l.id === selectedLanguage);
    if (langObj) {
      onChange(langObj.defaultCode);
    }
  };

  const handleLanguageChange = (newLang: string) => {
    setSelectedLanguage(newLang);
    const langObj = SUPPORTED_LANGUAGES.find((l) => l.id === newLang);
    if (langObj) {
      onChange(langObj.defaultCode);
    }
  };

  const currentLangObj =
    SUPPORTED_LANGUAGES.find((l) => l.id === selectedLanguage) || SUPPORTED_LANGUAGES[0];

  const targetLangObj =
    SUPPORTED_LANGUAGES.find((l) => l.id === normalizeLanguageId(initialLanguage)) ||
    SUPPORTED_LANGUAGES[0];

  return (
    <div
      className={cn(
        "flex flex-col w-full bg-slate-950 overflow-hidden transition-all duration-300",
        isFullScreen
          ? "fixed inset-0 z-[9999] rounded-none border-none p-2 bg-slate-950"
          : (className || "rounded-2xl border border-slate-800 shadow-2xl h-[620px] xl:h-[680px] min-h-[550px]")
      )}
    >
      {/* Top Main Toolbar */}
      <div className="flex flex-wrap items-center justify-between px-4 py-3 bg-slate-900/90 border-b border-slate-800/80 gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Code2 className="h-4 w-4 text-cyan-400" />
            <span className="text-xs font-bold text-slate-100 tracking-wide uppercase">
              VS Code Studio
            </span>
          </div>

          {/* Question Target Language Badge */}
          <Badge
            variant="outline"
            className="text-[11px] bg-emerald-950/80 text-emerald-400 border-emerald-700/50 px-2.5 py-0.5 font-mono font-bold flex items-center gap-1.5 shadow-sm"
          >
            <Sparkles className="h-3 w-3 text-emerald-400 animate-pulse" />
            Question Target: {targetLangObj.name.toUpperCase()}
          </Badge>

          {/* Active Selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase font-bold text-slate-400">Environment:</span>
            <Select value={selectedLanguage} onValueChange={handleLanguageChange} disabled={readOnly}>
              <SelectTrigger className="h-8 min-w-[170px] text-xs bg-slate-800/90 text-slate-100 border-slate-700 font-mono font-bold focus:ring-emerald-500">
                <SelectValue placeholder="Select Language" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800 text-slate-200 max-h-[300px]">
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <SelectItem
                    key={lang.id}
                    value={lang.id}
                    className="text-xs font-mono hover:bg-slate-800 cursor-pointer"
                  >
                    {lang.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleResetCode}
            disabled={readOnly}
            title="Reset to starter template"
            className="h-8 text-xs text-slate-300 hover:text-white hover:bg-slate-800 font-semibold"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearTerminal}
            title="Clear terminal console"
            className="h-8 text-xs text-slate-300 hover:text-white hover:bg-slate-800 font-semibold"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Clear Console
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsFullScreen(!isFullScreen)}
            title={isFullScreen ? "Exit Fullscreen" : "Fullscreen IDE"}
            className="h-8 w-8 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg"
          >
            {isFullScreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>

          {/* Custom Stdin Active Indicator Pill */}
          {stdin.trim() && (
            <Badge
              variant="outline"
              onClick={() => setActiveRightTab('stdin')}
              className="h-8 cursor-pointer bg-sky-950/70 hover:bg-sky-900/80 text-sky-400 border-sky-700/60 text-[10px] font-mono px-2.5 flex items-center gap-1.5 transition-all shadow-xs"
              title="Custom Stdin is active. Click to view or edit."
            >
              <Keyboard className="h-3 w-3 text-sky-400" />
              <span>Input: {stdin.trim().split('\n').length} line{stdin.trim().split('\n').length > 1 ? 's' : ''}</span>
            </Badge>
          )}

          {onRunCode && (
            <Button
              size="sm"
              onClick={() => {
                setActiveRightTab('terminal');
                onRunCode(selectedLanguage, value, stdin);
              }}
              disabled={isRunning || !value || !value.trim()}
              className="h-8 px-5 text-xs font-black bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg shadow-lg hover:shadow-emerald-900/40 transition-all flex items-center gap-2"
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Executing...
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-current text-white" /> Run {currentLangObj.name}
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Main Split Screen (Monaco Left 60% / xterm.js Right 40%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-hidden">
        {/* Monaco Code Editor Canvas */}
        <div className="lg:col-span-7 h-full border-b lg:border-b-0 lg:border-r border-slate-800/80 bg-[#1e1e1e] flex flex-col">
          <div className="flex items-center justify-between px-3 py-1.5 bg-[#252526] border-b border-[#333333] text-xs font-mono text-slate-400">
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              solution.{currentLangObj.monacoLang === 'python' ? 'py' : currentLangObj.monacoLang === 'cpp' ? 'cpp' : currentLangObj.monacoLang === 'java' ? 'java' : 'js'}
            </span>
            <span className="text-[10px] text-slate-500 uppercase">{currentLangObj.name}</span>
          </div>

          <div className="flex-1 w-full h-full">
            <Editor
              height="100%"
              language={currentLangObj.monacoLang}
              theme="vs-dark"
              value={value}
              onChange={onChange}
              options={{
                readOnly,
                fontSize: 14,
                fontFamily: '"Fira Code", Consolas, Monaco, "Courier New", monospace',
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 4,
                wordWrap: 'on',
                lineNumbers: 'on',
                folding: true,
                smoothScrolling: true,
                cursorBlinking: 'smooth',
                padding: { top: 12, bottom: 12 }
              }}
            />
          </div>
        </div>

        {/* Right Sandbox Panel: Tabbed between xterm.js Terminal & Custom Input */}
        <div className="lg:col-span-5 h-full bg-[#090d16] flex flex-col overflow-hidden">
          {/* Header Tabs Bar */}
          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/90 border-b border-slate-800">
            <div className="flex items-center gap-1 bg-slate-950/90 p-0.5 rounded-lg border border-slate-800/90">
              <button
                type="button"
                onClick={() => setActiveRightTab('terminal')}
                className={cn(
                  "px-2.5 py-1 text-[11px] font-bold rounded-md flex items-center gap-1.5 transition-all font-mono",
                  activeRightTab === 'terminal'
                    ? "bg-slate-800 text-emerald-400 shadow-sm border border-slate-700/80"
                    : "text-slate-400 hover:text-slate-200"
                )}
              >
                <TerminalIcon className="h-3 w-3 text-emerald-400" /> Output
              </button>
              <button
                type="button"
                onClick={() => setActiveRightTab('stdin')}
                className={cn(
                  "px-2.5 py-1 text-[11px] font-bold rounded-md flex items-center gap-1.5 transition-all font-mono relative",
                  activeRightTab === 'stdin'
                    ? "bg-slate-800 text-sky-400 shadow-sm border border-slate-700/80"
                    : "text-slate-400 hover:text-slate-200"
                )}
              >
                <Keyboard className="h-3 w-3 text-sky-400" /> Custom Input
                {stdin.trim() && (
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400 ring-2 ring-sky-950 animate-pulse" />
                )}
              </button>
            </div>

            <div className="flex items-center gap-2">
              {activeRightTab === 'terminal' ? (
                <Badge variant="outline" className="text-[9px] bg-slate-800/80 text-emerald-400 border-slate-700 font-mono">
                  Sandbox Active
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[9px] bg-sky-950/60 text-sky-400 border-sky-800/60 font-mono">
                  STDIN Stream
                </Badge>
              )}
            </div>
          </div>

          {/* Terminal Canvas (Kept in DOM so xterm session persists) */}
          <div 
            ref={terminalRef} 
            className={cn(
              "flex-1 w-full p-2 overflow-hidden bg-[#090d16]",
              activeRightTab !== 'terminal' && "hidden"
            )} 
          />

          {/* Custom Input (Stdin) Canvas */}
          {activeRightTab === 'stdin' && (
            <div className="flex-1 w-full p-3.5 flex flex-col bg-[#090d16] overflow-y-auto space-y-3 custom-scrollbar">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge className="bg-sky-500/10 text-sky-400 border-sky-500/30 text-[10px] font-mono px-2 py-0.5">
                    STDIN (Standard Input)
                  </Badge>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {stdin.trim() ? `${stdin.trim().split('\n').length} line(s)` : 'No custom input'}
                  </span>
                </div>
                {stdin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setStdin('')}
                    className="h-6 px-2 text-[10px] text-slate-400 hover:text-red-400 font-mono"
                  >
                    Clear Input
                  </Button>
                )}
              </div>

              <div className="relative flex-1 min-h-[160px] rounded-xl border border-slate-800 bg-[#0c121e] focus-within:border-sky-500/60 focus-within:ring-1 focus-within:ring-sky-500/40 transition-all overflow-hidden flex flex-col">
                <textarea
                  value={stdin}
                  onChange={(e) => setStdin(e.target.value)}
                  placeholder={`Enter standard input values (multi-line supported)...\n\nExample for Python:\n  name = input()\n  age = int(input())\n\nExample values:\n  Alice\n  21`}
                  className="w-full h-full flex-1 p-3.5 bg-transparent text-sky-200 font-mono text-xs sm:text-sm resize-none focus:outline-none placeholder:text-slate-600 custom-scrollbar leading-relaxed"
                  rows={8}
                />
              </div>

              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/90 text-[11px] text-slate-400 flex items-start gap-2.5">
                <Sparkles className="h-4 w-4 text-sky-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="text-slate-200 font-bold">Standard Input (stdin) is active.</p>
                  <p className="text-slate-400 text-[10px] leading-relaxed">
                    Values written here are automatically fed into your code's input methods like <code className="text-sky-300 bg-slate-800 px-1 py-0.5 rounded">input()</code> (Python), <code className="text-sky-300 bg-slate-800 px-1 py-0.5 rounded">cin &gt;&gt;</code> (C++), and <code className="text-sky-300 bg-slate-800 px-1 py-0.5 rounded">Scanner</code> (Java).
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
