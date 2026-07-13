"use client";

import React, { useMemo, useState } from "react";
import { ChevronRight, ChevronDown, Folder, File as FileIcon } from "lucide-react";
import type { FileEntry } from "@/lib/hosting/types";

interface Node {
  name: string;
  path: string;
  isDir: boolean;
  children: Node[];
}

function parentOf(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? "" : p.slice(0, i);
}

// Build a nested tree from flat POSIX relPaths. Directory nodes are created
// implicitly from path segments so intermediate dirs always exist as nodes.
function buildTree(entries: FileEntry[]): Node[] {
  const roots: Node[] = [];
  const byPath = new Map<string, Node>();

  const ensure = (path: string, isDir: boolean): Node => {
    const existing = byPath.get(path);
    if (existing) {
      if (isDir) existing.isDir = true;
      return existing;
    }
    const name = path.includes("/") ? path.slice(path.lastIndexOf("/") + 1) : path;
    const node: Node = { name, path, isDir, children: [] };
    byPath.set(path, node);
    const parent = parentOf(path);
    if (parent === "") roots.push(node);
    else ensure(parent, true).children.push(node);
    return node;
  };

  for (const e of entries) ensure(e.relPath, e.isDir);

  const sortRec = (nodes: Node[]) => {
    nodes.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

// Expand a minimal cover into every path it selects (the cover path + all
// descendants present in the tree).
export function expandCover(cover: string[], allPaths: string[]): Set<string> {
  const set = new Set<string>();
  for (const c of cover) {
    set.add(c);
    for (const p of allPaths) {
      if (p.startsWith(c + "/")) set.add(p);
    }
  }
  return set;
}

// Collapse a full selected set back to the top-most selected paths.
export function minimalCover(set: Set<string>): string[] {
  const cover: string[] = [];
  for (const p of Array.from(set)) {
    if (!set.has(parentOf(p))) cover.push(p);
  }
  return cover.sort();
}

// Pure: given the current expanded selection set, toggle `path` (a file, or a
// directory whose descendant paths are `descendantPaths`) and return the new
// minimal cover. On turn-off we must also drop `path`'s ancestor directories
// from the set, otherwise minimalCover would treat the subtree as fully covered
// and re-include the item the user just unchecked.
export function toggleSelection(selected: Set<string>, path: string, descendantPaths: string[]): string[] {
  const next = new Set(selected);
  const turningOn = !selected.has(path);
  for (const p of [path, ...descendantPaths]) {
    if (turningOn) next.add(p);
    else next.delete(p);
  }
  if (!turningOn) {
    let anc = parentOf(path);
    while (anc) { next.delete(anc); anc = parentOf(anc); }
  }
  return minimalCover(next);
}

export function FilePickerTree({
  entries,
  checked,
  onChange,
}: {
  entries: FileEntry[];
  checked: string[];
  onChange: (next: string[]) => void;
}) {
  const roots = useMemo(() => buildTree(entries), [entries]);
  const allPaths = useMemo(() => entries.map((e) => e.relPath), [entries]);
  const descendants = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const e of entries) {
      if (!e.isDir) continue;
      m.set(e.relPath, allPaths.filter((p) => p === e.relPath || p.startsWith(e.relPath + "/")));
    }
    return m;
  }, [entries, allPaths]);

  const selected = useMemo(() => expandCover(checked, allPaths), [checked, allPaths]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const isChecked = (node: Node) => selected.has(node.path);
  const isIndeterminate = (node: Node) => {
    if (!node.isDir || selected.has(node.path)) return false;
    const desc = descendants.get(node.path) || [];
    return desc.some((p) => selected.has(p));
  };

  const toggle = (node: Node) => {
    onChange(toggleSelection(selected, node.path, node.isDir ? (descendants.get(node.path) || []) : []));
  };

  const toggleExpand = (path: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(path) ? n.delete(path) : n.add(path);
      return n;
    });
  };

  const renderNode = (node: Node, depth: number): React.ReactNode => {
    const open = expanded.has(node.path);
    return (
      <div key={node.path}>
        <div className="flex items-center gap-1.5 py-0.5 hover:bg-slate-800/50 rounded" style={{ paddingLeft: depth * 16 }}>
          {node.isDir ? (
            <button onClick={() => toggleExpand(node.path)} className="text-slate-400 hover:text-white">
              {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          ) : (
            <span className="w-3.5" />
          )}
          <input
            type="checkbox"
            className="rounded bg-slate-900 border-slate-700 text-accentPurple focus:ring-accentPurple"
            checked={isChecked(node)}
            ref={(el) => { if (el) el.indeterminate = isIndeterminate(node); }}
            onChange={() => toggle(node)}
          />
          {node.isDir ? <Folder className="w-3.5 h-3.5 text-amber-400/80" /> : <FileIcon className="w-3.5 h-3.5 text-slate-400" />}
          <span className="text-xs text-slate-200 truncate">{node.name}</span>
        </div>
        {node.isDir && open && node.children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  if (entries.length === 0) {
    return <div className="text-xs text-slate-500 py-6 text-center">No files found.</div>;
  }

  return <div className="max-h-64 overflow-y-auto rounded-lg bg-slate-900/50 border border-white/5 p-2">{roots.map((n) => renderNode(n, 0))}</div>;
}
