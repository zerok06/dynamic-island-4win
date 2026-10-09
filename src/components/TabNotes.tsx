import React, { useState, useEffect } from 'react';
import { PlusCircle, BarChart2, X, Circle, CheckCircle2, GripVertical } from 'lucide-react';
import { TabNotesStats } from './TabNotesStats';
import { getTranslation, Language } from '../utils/i18n';

interface LocalTask {
  id: string;
  name: string;
  done: boolean;
  due_date: string | null;
  rollover_count: number;
  created_at_unix_s: number;
  completed_at_unix_s: number | null;
}

interface TabNotesProps {
  onCountChange: (count: number) => void;
  language: Language;
}

export const TabNotes: React.FC<TabNotesProps> = ({ onCountChange, language }) => {
  const t = getTranslation(language);
  const [todos, setTodos] = useState<LocalTask[]>([]);
  const [input, setInput] = useState('');
  const [showStats, setShowStats] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const dragIndexRef = React.useRef<number | null>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  const isTauri = !!(window as any).__TAURI__;

  // Load Todos from SQLite Local DB or LocalStorage Mock
  const fetchTodos = async () => {
    const today = new Date().toISOString().split('T')[0];
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const list = await invoke<LocalTask[]>('get_local_tasks', { today });
        setTodos(list);
      } catch (err) {
        console.error('Failed to fetch local tasks:', err);
      }
    } else {
      const saved = localStorage.getItem('local_tasks_mock');
      if (saved) {
        const list: LocalTask[] = JSON.parse(saved);
        const filtered = list.filter((t) => t.done || !t.due_date || t.due_date <= today);
        setTodos(filtered);
      } else {
        setTodos([]);
        localStorage.setItem('local_tasks_mock', JSON.stringify([]));
      }
    }
  };

  useEffect(() => {
    fetchTodos();
    const intervalId = setInterval(fetchTodos, 3000);
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const activeCount = todos.filter((t) => !t.done).length;
    onCountChange(activeCount);
  }, [todos]);

  const addNote = async () => {
    if (!input.trim()) return;

    // Check limit
    const activeCount = todos.filter((t) => !t.done).length;
    if (activeCount >= 20) return;

    const today = new Date().toISOString().split('T')[0];

    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('add_local_task', { name: input.trim(), dueDate: today, today });
        fetchTodos();
      } catch (err) {
        console.error('Failed to save local task:', err);
      }
    } else {
      const newTodo: LocalTask = {
        id: `task_${crypto.randomUUID()}`,
        name: input.trim(),
        done: false,
        due_date: today,
        rollover_count: 0,
        created_at_unix_s: Math.floor(Date.now() / 1000),
        completed_at_unix_s: null,
      };
      setTodos((prev) => {
        const next = [...prev, newTodo];
        localStorage.setItem('local_tasks_mock', JSON.stringify(next));
        return next;
      });
    }
    setInput('');
  };

  const toggleNote = async (id: string) => {
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('toggle_local_task', { id });
        fetchTodos();
      } catch (err) {
        console.error('Failed to update local task:', err);
      }
    } else {
      // Mock toggle on web (+1 day recurrence)
      setTodos((prev) => {
        const todo = prev.find((t) => t.id === id);
        if (!todo) return prev;

        const updated = {
          ...todo,
          done: !todo.done,
          completed_at_unix_s: !todo.done ? Math.floor(Date.now() / 1000) : null,
        };

        let next = prev.map((t) => (t.id === id ? updated : t));

        // Create recurrence mock
        if (updated.done && updated.due_date) {
          const parts = updated.due_date.split('-');
          if (parts.length === 3) {
            const d = new Date(updated.due_date);
            d.setDate(d.getDate() + 1);
            const nextDateStr = d.toISOString().split('T')[0];

            // Check if already exists to prevent duplicate breeding in mock
            const exists = next.some(t => t.name === updated.name && t.due_date === nextDateStr);
            if (!exists) {
              const activeCount = next.filter((t) => !t.done).length;
              if (activeCount < 20) {
                const recurringTask: LocalTask = {
                  id: `task_${crypto.randomUUID()}`,
                  name: updated.name,
                  done: false,
                  due_date: nextDateStr,
                  rollover_count: 0,
                  created_at_unix_s: Math.floor(Date.now() / 1000),
                  completed_at_unix_s: null,
                };
                next = [recurringTask, ...next];
              }
            }
          }
        }

        localStorage.setItem('local_tasks_mock', JSON.stringify(next));
        return next;
      });
    }
  };

  const deleteNote = async (id: string) => {
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('delete_local_task', { id });
        setTodos((prev) => prev.filter((t) => t.id !== id));
      } catch (err) {
        console.error('Failed to delete local task:', err);
      }
    } else {
      setTodos((prev) => {
        const next = prev.filter((t) => t.id !== id);
        localStorage.setItem('local_tasks_mock', JSON.stringify(next));
        return next;
      });
    }
  };

  const handleRename = async (id: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) {
      setEditingId(null);
      return;
    }
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('update_local_task', { id, name: trimmed });
        fetchTodos();
      } catch (err) {
        console.error('Failed to rename local task:', err);
      }
    } else {
      setTodos((prev) => {
        const next = prev.map((t) => (t.id === id ? { ...t, name: trimmed } : t));
        localStorage.setItem('local_tasks_mock', JSON.stringify(next));
        return next;
      });
    }
    setEditingId(null);
  };

  const persistOrder = (ordered: LocalTask[]) => {
    if (isTauri) {
      import('@tauri-apps/api/core').then(({ invoke }) => {
        invoke('reorder_local_tasks', { orderedIds: ordered.map((t) => t.id) }).catch((err) => {
          console.error('Failed to persist task order:', err);
          fetchTodos();
        });
      });
    } else {
      localStorage.setItem('local_tasks_mock', JSON.stringify(ordered));
    }
  };

  // Tính vị trí chèn dựa trên con trỏ so với tâm từng hàng | Compute the insertion index from the pointer position vs each row midpoint
  const computeInsertIndex = (clientY: number): number => {
    const container = listRef.current;
    if (!container) return 0;
    const rows = Array.from(container.children) as HTMLElement[];
    for (let i = 0; i < rows.length; i++) {
      const rect = rows[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return i;
    }
    return rows.length;
  };

  const handlePointerDown = (index: number, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragIndexRef.current = index;
    setDragIndex(index);
    setDropIndex(index);
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (dragIndexRef.current === null) return;
    const insert = computeInsertIndex(e.clientY);
    setDropIndex(Math.min(insert, Math.max(0, todos.length - 1)));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const from = dragIndexRef.current;
    dragIndexRef.current = null;
    if (from === null) return;

    const insertIndex = computeInsertIndex(e.clientY);
    setDragIndex(null);
    setDropIndex(null);

    const next = [...todos];
    const [moved] = next.splice(from, 1);
    let at = insertIndex;
    if (from < insertIndex) at = insertIndex - 1;
    at = Math.max(0, Math.min(at, next.length));
    if (at === from) return;

    next.splice(at, 0, moved);
    setTodos(next);
    persistOrder(next);
  };

  const formatTime = (unixS: number | null) => {
    if (!unixS) return '';
    const date = new Date(unixS * 1000);
    const hrs = date.getHours().toString().padStart(2, '0');
    const mins = date.getMinutes().toString().padStart(2, '0');
    return `${hrs}:${mins}`;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') addNote();
    if (e.key === 'Escape') setInput('');
  };

  const activeTasks = todos.filter((t) => !t.done);
  const limitReached = activeTasks.length >= 20;

  if (showStats) {
    return <TabNotesStats onBack={() => setShowStats(false)} language={language} />;
  }

  return (
    <div className="flex flex-col gap-3 w-full max-h-[320px]">
      {/* Header with Stats Toggle */}
      <div className="flex items-center justify-between border-b border-island/[0.04] pb-2">
        <span className="text-[12px] font-black uppercase tracking-widest text-island/40">{t.tasksTitle}</span>
        <button
          onClick={() => setShowStats(true)}
          className="px-2.5 py-1 rounded bg-island/[0.04] hover:bg-island/[0.08] text-island/60 hover:text-island transition-all text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 border border-island/5"
        >
          <BarChart2 className="w-3.5 h-3.5 text-success-color" />
          {t.tasksStats}
        </button>
      </div>

      {/* List */}
      <div ref={listRef} className="flex flex-col gap-2 overflow-y-auto custom-scrollbar flex-grow pr-1">
        {todos.map((todo, index) => {
          const isDone = todo.done;
          return (
            <div
              key={todo.id}
              className={`group flex items-center justify-between px-3 py-2 rounded-md transition-all duration-[400ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${dragIndex === index ? 'opacity-40 ' : ''}${dropIndex === index && dragIndex !== index ? 'ring-1 ring-inset ring-success-color ' : ''}${
                editingId === todo.id
                  ? 'bg-island/[0.02] border border-success-color border-dashed'
                  : isDone
                  ? 'bg-island/[0.01] border border-island/[0.02] hover:bg-island/[0.04] opacity-60'
                  : 'bg-island/[0.02] border border-island/[0.03] hover:bg-island/[0.06]'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div
                  onPointerDown={(e) => handlePointerDown(index, e)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  style={{ touchAction: 'none' }}
                  className="cursor-grab active:cursor-grabbing text-island/20 hover:text-island/60 transition-colors flex-shrink-0 -ml-1 select-none"
                  title="Drag to reorder"
                >
                  <GripVertical className="w-4 h-4" />
                </div>
                <button
                  onClick={() => toggleNote(todo.id)}
                  className="focus:outline-none transition-transform hover:scale-110 active:scale-95 flex-shrink-0"
                >
                  {isDone ? (
                    <CheckCircle2 className="w-[18px] h-[18px] text-success-color fill-success-color/10" />
                  ) : (
                    <Circle className="w-[18px] h-[18px] text-island/30 hover:text-success-color hover:border-success-color" />
                  )}
                </button>
                {editingId === todo.id ? (
                  <input
                    type="text"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onBlur={() => handleRename(todo.id, editText)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRename(todo.id, editText);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    autoFocus
                    className="flex-grow bg-transparent border-none text-[13px] outline-none text-island w-full min-w-0 p-0"
                  />
                ) : (
                  <span
                    className={`text-[13px] truncate mr-2 cursor-pointer select-none ${isDone ? 'line-through text-text-secondary/60' : 'text-island/90 hover:text-island'}`}
                    onDoubleClick={() => {
                      if (!isDone) {
                        setEditingId(todo.id);
                        setEditText(todo.name);
                      }
                    }}
                    title={isDone ? undefined : "Double-click to edit"}
                  >
                    {todo.name}
                  </span>
                )}
                {/* Rollover Badge */}
                {!isDone && todo.rollover_count > 0 && (
                  <span className={`text-[9.5px] px-1.5 py-0.5 rounded font-black font-mono tracking-wider flex-shrink-0 ${
                    todo.rollover_count >= 3
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                      : 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                  }`}>
                    {t.tasksRollover} {todo.rollover_count}/3
                  </span>
                )}
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {isDone && todo.completed_at_unix_s && (
                <span className="text-[10px] text-island/35 font-mono select-none" title="Completion time">
                  {formatTime(todo.completed_at_unix_s)}
                </span>
              )}
              <button
                onClick={() => deleteNote(todo.id)}
                className="text-red-500 hover:scale-110 active:scale-95 opacity-0 group-hover:opacity-100 transition-all duration-[400ms] ease-[cubic-bezier(0.32,0.72,0,1)]"
                title="Delete task"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg border transition-all duration-[400ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${
        limitReached
          ? 'bg-red-500/[0.02] border-red-500/20'
          : 'bg-island/[0.02] border-island/[0.04] focus-within:border-success-color focus-within:border-dashed'
      }`}>
        <PlusCircle
          onClick={addNote}
          className={`w-[18px] h-[18px] transition-all duration-[400ms] ${
            limitReached
              ? 'text-red-500/40 cursor-not-allowed'
              : 'text-text-secondary hover:text-success-color hover:scale-110 active:scale-95 cursor-pointer'
          }`}
        />
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={limitReached}
          placeholder={limitReached ? t.tasksLimitReached : t.tasksPlaceholder}
          className={`flex-grow bg-transparent border-none text-[13px] outline-none transition-colors ${
            limitReached ? 'text-red-400/60 placeholder-red-400/40' : 'text-island placeholder-text-secondary'
          }`}
        />
        {!limitReached && (
          <div className="flex items-center gap-1 text-[10px] text-island/30 font-medium select-none pr-1 flex-shrink-0">
            <span>↵ {t.tasksAdd}</span>
            <span className="text-island/10 font-bold">·</span>
            <span>{t.tasksEsc}</span>
          </div>
        )}
      </div>
    </div>
  );
};
