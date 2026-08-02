"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ClipboardPaste,
  Copy,
  LayoutGrid,
  ListChecks,
  Pencil,
  Plus,
  Save,
  Scissors,
  Tag,
  Trash2,
  Undo2,
  Redo2,
} from "lucide-react";
import { toast } from "sonner";
import { useTableStore } from "@/lib/stores";
import { TableFloorMap } from "@/components/tables";
import { TableLayoutInspector } from "@/components/admin/table-layout-inspector";
import type { RestaurantTable, TableMapLabel, TableZone } from "@/types/database";

type EditingEntity =
  | { kind: "zone"; id: string }
  | { kind: "table"; id: string }
  | { kind: "label"; id: string };

type ClipboardTable = Pick<
  RestaurantTable,
  | "name"
  | "zone_id"
  | "shape"
  | "position_x"
  | "position_y"
  | "width"
  | "height"
  | "rotation"
  | "capacity"
>;

type LayoutSnapshot = {
  zones: TableZone[];
  tables: RestaurantTable[];
  labels: TableMapLabel[];
};

function snapshotFrom(
  zones: TableZone[],
  tables: RestaurantTable[],
  labels: TableMapLabel[]
): LayoutSnapshot {
  return {
    zones: zones.map((zone) => ({ ...zone })),
    tables: tables.map((table) => ({ ...table })),
    labels: labels.map((label) => ({ ...label })),
  };
}

function snapshotsEqual(first: LayoutSnapshot, second: LayoutSnapshot) {
  return JSON.stringify(first) === JSON.stringify(second);
}

function tableUpdate(table: RestaurantTable) {
  return {
    zone_id: table.zone_id,
    name: table.name.trim(),
    shape: table.shape,
    position_x: table.position_x,
    position_y: table.position_y,
    width: table.width,
    height: table.height,
    rotation: table.rotation,
    capacity: table.capacity,
    is_active: table.is_active,
  };
}

function zoneUpdate(zone: TableZone) {
  return {
    name: zone.name.trim(),
    sort_order: zone.sort_order,
    position_x: zone.position_x,
    position_y: zone.position_y,
    width: zone.width,
    height: zone.height,
    is_active: zone.is_active,
  };
}

function labelUpdate(label: TableMapLabel) {
  return {
    label_text: label.label_text.trim() || "Referencia",
    position_x: label.position_x,
    position_y: label.position_y,
    width: label.width,
    height: label.height,
    background_color: label.background_color,
    text_color: label.text_color,
    border_color: label.border_color,
    sort_order: label.sort_order,
    is_active: label.is_active,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function preserveTableScale(
  table: RestaurantTable,
  previousZone: TableZone,
  nextZone: TableZone
) {
  const widthRatio = previousZone.width / Math.max(nextZone.width, 0.01);
  const heightRatio = previousZone.height / Math.max(nextZone.height, 0.01);
  return {
    position_x: clamp(table.position_x * widthRatio, 0.07, 0.93),
    position_y: clamp(table.position_y * heightRatio, 0.07, 0.93),
    width: clamp(table.width * widthRatio, 0.14, 0.65),
    height: clamp(table.height * heightRatio, 0.12, 0.7),
  };
}

function nextCopyName(name: string, existingNames: string[]) {
  const baseName = name.replace(/\s+copia(?:\s+\d+)?$/i, "");
  let copyName = `${baseName} copia`;
  let index = 2;
  while (existingNames.includes(copyName)) {
    copyName = `${baseName} copia ${index}`;
    index += 1;
  }
  return copyName;
}

export function TableLayoutEditor() {
  const {
    zones,
    tables,
    labels,
    loading,
    fetchTables,
    createZone,
    updateZone,
    deactivateZone,
    createTable,
    updateTable,
    deactivateTable,
    createLabel,
    updateLabel,
    deactivateLabel,
  } = useTableStore();
  const [zoneDrafts, setZoneDrafts] = useState<Record<string, Partial<TableZone>>>({});
  const [tableDrafts, setTableDrafts] = useState<Record<string, Partial<RestaurantTable>>>({});
  const [labelDrafts, setLabelDrafts] = useState<Record<string, Partial<TableMapLabel>>>({});
  const [selectedZoneId, setSelectedZoneId] = useState("");
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null);
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);
  const [clipboardTables, setClipboardTables] = useState<ClipboardTable[]>([]);
  const [editingEntity, setEditingEntity] = useState<EditingEntity | null>(null);
  const [newZoneName, setNewZoneName] = useState("");
  const [saving, setSaving] = useState(false);
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
  const historyRef = useRef<LayoutSnapshot[]>([]);
  const historyIndexRef = useRef(-1);
  const historyReadyRef = useRef(false);
  const historyBusyRef = useRef(false);
  const historyGestureStartRef = useRef<LayoutSnapshot | null>(null);
  const historyEditStartRef = useRef<LayoutSnapshot | null>(null);
  const keyboardActionsRef = useRef<{
    undo: () => Promise<void>;
    redo: () => Promise<void>;
    copy: () => void;
    cut: () => Promise<void>;
    paste: () => Promise<void>;
    selectAll: () => void;
    deleteSelection: () => Promise<void>;
    editSelected: () => void;
    clearSelection: () => void;
  }>({
    undo: async () => undefined,
    redo: async () => undefined,
    copy: () => undefined,
    cut: async () => undefined,
    paste: async () => undefined,
    selectAll: () => undefined,
    deleteSelection: async () => undefined,
    editSelected: () => undefined,
    clearSelection: () => undefined,
  });

  useEffect(() => {
    keyboardActionsRef.current = {
      undo: handleUndo,
      redo: handleRedo,
      copy: handleCopySelection,
      cut: handleCutSelection,
      paste: handlePasteSelection,
      selectAll: handleSelectAll,
      deleteSelection: async () => {
        if (selectedLabel) await handleQuickDeleteLabel(selectedLabel);
        else await handleDeleteSelection();
      },
      editSelected: () => {
        if (selectedLabel) editLabel(selectedLabel);
        else if (selectedTableId && selectedTables[0]) editTable(selectedTables[0]);
      },
      clearSelection: () => {
        setSelectedTableIds([]);
        setSelectionAnchorId(null);
        setSelectedLabelId(null);
      },
    };
  });

  useEffect(() => {
    let active = true;
    void fetchTables().then(() => {
      if (!active || historyReadyRef.current) return;
      const current = useTableStore.getState();
      const initial = snapshotFrom(current.zones, current.tables, current.labels);
      historyRef.current = [initial];
      historyIndexRef.current = 0;
      historyReadyRef.current = true;
      setHistoryState({ canUndo: false, canRedo: false });
    });
    return () => {
      active = false;
    };
  }, [fetchTables]);

  const displayZones = zones.map((zone) => ({ ...zone, ...zoneDrafts[zone.id] }));
  const displayTables = tables.map((table) => ({ ...table, ...tableDrafts[table.id] }));
  const displayLabels = labels.map((label) => ({ ...label, ...labelDrafts[label.id] }));
  const selectedZone = displayZones.find((zone) => zone.id === selectedZoneId) ?? null;
  const selectedTableId = selectedTableIds.length === 1 ? selectedTableIds[0] : null;
  const selectedTables = displayTables.filter((table) => selectedTableIds.includes(table.id));
  const selectedLabel = displayLabels.find((label) => label.id === selectedLabelId) ?? null;
  const { canUndo, canRedo } = historyState;
  const editingZoneBase =
    editingEntity?.kind === "zone"
      ? zones.find((zone) => zone.id === editingEntity.id) ?? null
      : null;
  const editingZone = editingZoneBase
    ? { ...editingZoneBase, ...zoneDrafts[editingZoneBase.id] }
    : null;
  const editingTableBase =
    editingEntity?.kind === "table"
      ? tables.find((table) => table.id === editingEntity.id) ?? null
      : null;
  const editingTable = editingTableBase
    ? { ...editingTableBase, ...tableDrafts[editingTableBase.id] }
    : null;
  const editingLabelBase =
    editingEntity?.kind === "label"
      ? labels.find((label) => label.id === editingEntity.id) ?? null
      : null;
  const editingLabel = editingLabelBase
    ? { ...editingLabelBase, ...labelDrafts[editingLabelBase.id] }
    : null;
  const editingZoneTableCount = editingZone
    ? displayTables.filter((table) => table.zone_id === editingZone.id).length
    : 0;

  function captureSnapshot() {
    return snapshotFrom(displayZones, displayTables, displayLabels);
  }

  function recordHistory(before: LayoutSnapshot, after: LayoutSnapshot) {
    if (historyBusyRef.current || snapshotsEqual(before, after)) return;
    if (!historyReadyRef.current) {
      historyRef.current = [before];
      historyIndexRef.current = 0;
      historyReadyRef.current = true;
    }

    const entries = historyRef.current.slice(0, historyIndexRef.current + 1);
    if (entries.length === 0 || !snapshotsEqual(entries[entries.length - 1], before)) {
      entries.push(before);
    }
    entries.push(after);
    historyRef.current = entries.slice(-50);
    historyIndexRef.current = historyRef.current.length - 1;
    setHistoryState({
      canUndo: historyIndexRef.current > 0,
      canRedo: false,
    });
  }

  function beginHistoryGesture() {
    if (!historyBusyRef.current) historyGestureStartRef.current = captureSnapshot();
  }

  async function applyHistorySnapshot(target: LayoutSnapshot) {
    if (historyBusyRef.current) return false;
    historyBusyRef.current = true;
    setSaving(true);
    try {
      const current = useTableStore.getState();
      const currentZones = new Map(current.zones.map((zone) => [zone.id, zone]));
      const currentTables = new Map(current.tables.map((table) => [table.id, table]));
      const currentLabels = new Map(current.labels.map((label) => [label.id, label]));
      const targetZones = new Map(target.zones.map((zone) => [zone.id, zone]));
      const targetTables = new Map(target.tables.map((table) => [table.id, table]));
      const targetLabels = new Map(target.labels.map((label) => [label.id, label]));

      const zoneIds = Array.from(new Set([...currentZones.keys(), ...targetZones.keys()]));
      const tableIds = Array.from(new Set([...currentTables.keys(), ...targetTables.keys()]));
      const labelIds = Array.from(new Set([...currentLabels.keys(), ...targetLabels.keys()]));
      const [zoneResults, tableResults, labelResults] = await Promise.all([
        Promise.all(
          zoneIds.map((id) => {
            const zone = targetZones.get(id);
            return zone
              ? updateZone(id, zoneUpdate(zone))
              : updateZone(id, { is_active: false });
          })
        ),
        Promise.all(
          tableIds.map((id) => {
            const table = targetTables.get(id);
            return table
              ? updateTable(id, tableUpdate(table))
              : updateTable(id, { is_active: false });
          })
        ),
        Promise.all(
          labelIds.map((id) => {
            const label = targetLabels.get(id);
            return label
              ? updateLabel(id, labelUpdate(label))
              : updateLabel(id, { is_active: false });
          })
        ),
      ]);

      if (![...zoneResults, ...tableResults, ...labelResults].every(Boolean)) {
        toast.error("No se pudo restaurar todo el mapa");
        return false;
      }

      await fetchTables(true);
      setZoneDrafts({});
      setTableDrafts({});
      setLabelDrafts({});
      setSelectedTableIds([]);
      setSelectionAnchorId(null);
      setSelectedLabelId(null);
      setEditingEntity(null);
      return true;
    } finally {
      historyBusyRef.current = false;
      setSaving(false);
    }
  }

  async function handleUndo() {
    if (!canUndo || historyBusyRef.current) return;
    const target = historyRef.current[historyIndexRef.current - 1];
    if (!target) return;
    if (await applyHistorySnapshot(target)) {
      historyIndexRef.current -= 1;
      setHistoryState({
        canUndo: historyIndexRef.current > 0,
        canRedo: historyIndexRef.current < historyRef.current.length - 1,
      });
      toast.success("Cambio deshecho");
    }
  }

  async function handleRedo() {
    if (!canRedo || historyBusyRef.current) return;
    const target = historyRef.current[historyIndexRef.current + 1];
    if (!target) return;
    if (await applyHistorySnapshot(target)) {
      historyIndexRef.current += 1;
      setHistoryState({
        canUndo: historyIndexRef.current > 0,
        canRedo: historyIndexRef.current < historyRef.current.length - 1,
      });
      toast.success("Cambio rehecho");
    }
  }

  function updateDraftZone(id: string, updates: Partial<TableZone>) {
    setZoneDrafts((current) => ({
      ...current,
      [id]: { ...current[id], ...updates },
    }));
  }

  function resizeDraftZone(id: string, updates: Partial<TableZone>) {
    const previousZone = displayZones.find((zone) => zone.id === id);
    if (!previousZone || (updates.width === undefined && updates.height === undefined)) {
      updateDraftZone(id, updates);
      return;
    }

    const nextZone = { ...previousZone, ...updates };
    updateDraftZone(id, updates);
    setTableDrafts((current) => {
      const next = { ...current };
      tables
        .filter((table) => table.zone_id === id)
        .forEach((table) => {
          const currentTable = { ...table, ...current[table.id] };
          next[table.id] = {
            ...current[table.id],
            ...preserveTableScale(currentTable, previousZone, nextZone),
          };
        });
      return next;
    });
  }

  function updateDraftTable(id: string, updates: Partial<RestaurantTable>) {
    setTableDrafts((current) => ({
      ...current,
      [id]: { ...current[id], ...updates },
    }));
  }

  function updateDraftLabel(id: string, updates: Partial<TableMapLabel>) {
    setLabelDrafts((current) => ({
      ...current,
      [id]: { ...current[id], ...updates },
    }));
  }

  function focusZone(zone: TableZone) {
    setSelectedZoneId(zone.id);
    setSelectedTableIds([]);
    setSelectionAnchorId(null);
    setSelectedLabelId(null);
  }

  function editZone(zone: TableZone) {
    focusZone(zone);
    historyEditStartRef.current = captureSnapshot();
    setEditingEntity({ kind: "zone", id: zone.id });
  }

  function focusTable(
    table: RestaurantTable,
    event?: React.MouseEvent<HTMLButtonElement>
  ) {
    const additive = Boolean(event?.ctrlKey || event?.metaKey);
    const range = Boolean(event?.shiftKey && selectionAnchorId);
    if (range) {
      const anchorIndex = displayTables.findIndex((item) => item.id === selectionAnchorId);
      const targetIndex = displayTables.findIndex((item) => item.id === table.id);
      if (anchorIndex >= 0 && targetIndex >= 0) {
        const start = Math.min(anchorIndex, targetIndex);
        const end = Math.max(anchorIndex, targetIndex);
        const rangeIds = displayTables.slice(start, end + 1).map((item) => item.id);
        setSelectedTableIds((current) => Array.from(new Set([...current, ...rangeIds])));
      }
    } else if (additive) {
      setSelectedTableIds((current) =>
        current.includes(table.id)
          ? current.filter((id) => id !== table.id)
          : [...current, table.id]
      );
    } else {
      setSelectedTableIds([table.id]);
    }
    setSelectedLabelId(null);
    setSelectionAnchorId(table.id);
    if (table.zone_id) setSelectedZoneId(table.zone_id);
  }

  function editTable(table: RestaurantTable) {
    focusTable(table);
    historyEditStartRef.current = captureSnapshot();
    setEditingEntity({ kind: "table", id: table.id });
  }

  function focusLabel(label: TableMapLabel) {
    setSelectedLabelId(label.id);
    setSelectedZoneId("");
    setSelectedTableIds([]);
    setSelectionAnchorId(null);
  }

  function editLabel(label: TableMapLabel) {
    focusLabel(label);
    historyEditStartRef.current = captureSnapshot();
    setEditingEntity({ kind: "label", id: label.id });
  }

  function closeInspector() {
    setEditingEntity(null);
    historyEditStartRef.current = null;
  }

  async function handleAddZone(event: React.FormEvent) {
    event.preventDefault();
    const name = newZoneName.trim();
    if (!name) return;
    const before = captureSnapshot();
    const zone = await createZone(name);
    if (!zone) {
      toast.error("No se pudo crear la zona");
      return;
    }
    setNewZoneName("");
    setSelectedZoneId(zone.id);
    setSelectedTableIds([]);
    setSelectionAnchorId(null);
    setSelectedLabelId(null);
    setEditingEntity({ kind: "zone", id: zone.id });
    recordHistory(before, { ...before, zones: [...before.zones, zone] });
    toast.success("Zona creada");
  }

  async function handleAddTable() {
    const zoneId = selectedZoneId || displayZones[0]?.id || "";
    if (!zoneId) {
      toast.error("Crea o selecciona una zona primero");
      return;
    }
    const before = captureSnapshot();
    const table = await createTable({
      name: `Mesa ${tables.length + 1}`,
      zone_id: zoneId,
    });
    if (!table) {
      toast.error("No se pudo crear la mesa");
      return;
    }
    setSelectedZoneId(zoneId);
    setSelectedTableIds([table.id]);
    setSelectionAnchorId(table.id);
    setSelectedLabelId(null);
    setEditingEntity({ kind: "table", id: table.id });
    recordHistory(before, { ...before, tables: [...before.tables, table] });
    toast.success("Mesa agregada");
  }

  async function handleAddLabel() {
    const before = captureSnapshot();
    const label = await createLabel();
    if (!label) {
      toast.error("No se pudo crear la referencia");
      return;
    }
    setSelectedLabelId(label.id);
    setSelectedZoneId("");
    setSelectedTableIds([]);
    setSelectionAnchorId(null);
    setEditingEntity({ kind: "label", id: label.id });
    recordHistory(before, { ...before, labels: [...before.labels, label] });
    toast.success("Referencia agregada");
  }

  function buildClipboardTables(source = selectedTables): ClipboardTable[] {
    return source.map((table) => ({
      name: table.name,
      zone_id: table.zone_id,
      shape: table.shape,
      position_x: table.position_x,
      position_y: table.position_y,
      width: table.width,
      height: table.height,
      rotation: table.rotation,
      capacity: table.capacity,
    }));
  }

  function handleCopySelection() {
    if (selectedTables.length === 0) return;
    const copied = buildClipboardTables();
    setClipboardTables(copied);
    toast.success(`${copied.length} ${copied.length === 1 ? "mesa copiada" : "mesas copiadas"}`);
  }

  async function pasteTables(source: ClipboardTable[]) {
    if (source.length === 0) return;
    const before = captureSnapshot();
    setSaving(true);
    try {
      const existingNames = displayTables.map((table) => table.name);
      const createdTables: RestaurantTable[] = [];
      for (const table of source) {
        const created = await createTable({
          name: nextCopyName(table.name, existingNames),
          zone_id: table.zone_id,
          shape: table.shape,
          capacity: table.capacity,
          position_x: table.position_x > 0.84 ? 0.18 : clamp(table.position_x + 0.08, 0.08, 0.92),
          position_y: table.position_y > 0.84 ? 0.18 : clamp(table.position_y + 0.08, 0.08, 0.92),
          width: table.width,
          height: table.height,
          rotation: table.rotation,
        });
        if (created) {
          createdTables.push(created);
          existingNames.push(created.name);
        }
      }

      if (createdTables.length === 0) {
        toast.error("No se pudieron pegar las mesas");
        return;
      }
      setSelectedTableIds(createdTables.map((table) => table.id));
      setSelectionAnchorId(createdTables[createdTables.length - 1]?.id ?? null);
      setSelectedLabelId(null);
      setSelectedZoneId(createdTables[0].zone_id ?? "");
      recordHistory(before, { ...before, tables: [...before.tables, ...createdTables] });
      toast.success(`${createdTables.length} ${createdTables.length === 1 ? "mesa pegada" : "mesas pegadas"}`);
    } finally {
      setSaving(false);
    }
  }

  async function handlePasteSelection() {
    await pasteTables(clipboardTables);
  }

  async function handleDuplicateSelection() {
    if (selectedTables.length === 0) return;
    const copied = buildClipboardTables();
    setClipboardTables(copied);
    await pasteTables(copied);
  }

  async function removeTables(items: RestaurantTable[]) {
    if (items.length === 0) return;
    const before = captureSnapshot();
    setSaving(true);
    try {
      const results = await Promise.all(
        items.map(async (table) => ({
          id: table.id,
          deleted: await deactivateTable(table.id),
        }))
      );
      const deletedIds = results.filter((result) => result.deleted).map((result) => result.id);
      setSelectedTableIds((current) => current.filter((id) => !deletedIds.includes(id)));
      setSelectionAnchorId((current) => (current && deletedIds.includes(current) ? null : current));
      if (deletedIds.length > 0) {
        recordHistory(before, {
          ...before,
          tables: before.tables.filter((table) => !deletedIds.includes(table.id)),
        });
      }
      if (deletedIds.length === items.length) {
        toast.success(`${deletedIds.length} ${deletedIds.length === 1 ? "mesa eliminada" : "mesas eliminadas"}`);
      } else {
        toast.error("Algunas mesas no se pudieron eliminar");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteSelection() {
    if (selectedTables.length === 0) return;
    const confirmed = window.confirm(
      `¿Eliminar ${selectedTables.length} ${selectedTables.length === 1 ? "mesa" : "mesas"}?`
    );
    if (confirmed) await removeTables(selectedTables);
  }

  async function handleCutSelection() {
    if (selectedTables.length === 0) return;
    const confirmed = window.confirm(
      `¿Cortar ${selectedTables.length} ${selectedTables.length === 1 ? "mesa" : "mesas"}?`
    );
    if (!confirmed) return;
    setClipboardTables(buildClipboardTables());
    await removeTables(selectedTables);
  }

  function handleSelectAll() {
    setSelectedTableIds(displayTables.map((table) => table.id));
    setSelectionAnchorId(displayTables[0]?.id ?? null);
    setSelectedLabelId(null);
    if (!selectedZoneId && displayZones[0]) setSelectedZoneId(displayZones[0].id);
  }

  async function handleLabelMoveEnd(
    id: string,
    updates: Pick<TableMapLabel, "position_x" | "position_y">
  ) {
    const label = labels.find((item) => item.id === id);
    if (!label) return;
    const before = historyGestureStartRef.current ?? captureSnapshot();
    const savedLabel = { ...label, ...labelDrafts[id], ...updates };
    const saved = await updateLabel(id, labelUpdate(savedLabel));
    if (saved) {
      const after = captureSnapshot();
      after.labels = after.labels.map((item) => (item.id === id ? savedLabel : item));
      recordHistory(before, after);
      setLabelDrafts((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    } else {
      toast.error("No se pudo mover la referencia");
    }
    historyGestureStartRef.current = null;
  }

  async function handleLabelResizeEnd(
    id: string,
    updates: Pick<TableMapLabel, "width" | "height">
  ) {
    const label = labels.find((item) => item.id === id);
    if (!label) return;
    const before = historyGestureStartRef.current ?? captureSnapshot();
    const savedLabel = { ...label, ...labelDrafts[id], ...updates };
    const saved = await updateLabel(id, labelUpdate(savedLabel));
    if (saved) {
      const after = captureSnapshot();
      after.labels = after.labels.map((item) => (item.id === id ? savedLabel : item));
      recordHistory(before, after);
      setLabelDrafts((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    } else {
      toast.error("No se pudo cambiar el tamaño de la referencia");
    }
    historyGestureStartRef.current = null;
  }

  async function handleTableMoveEnd(
    id: string,
    updates: Pick<RestaurantTable, "position_x" | "position_y">
  ) {
    const table = tables.find((item) => item.id === id);
    if (!table) return;
    const before = historyGestureStartRef.current ?? captureSnapshot();
    const savedTable = { ...table, ...tableDrafts[id], ...updates };
    const saved = await updateTable(id, tableUpdate(savedTable));
    if (saved) {
      const after = captureSnapshot();
      after.tables = after.tables.map((item) => (item.id === id ? savedTable : item));
      recordHistory(before, after);
      setTableDrafts((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    } else {
      toast.error("No se pudo mover la mesa");
    }
    historyGestureStartRef.current = null;
  }

  async function handleTableResizeEnd(
    id: string,
    updates: Pick<RestaurantTable, "position_x" | "position_y" | "width" | "height">
  ) {
    const table = tables.find((item) => item.id === id);
    if (!table) return;
    const before = historyGestureStartRef.current ?? captureSnapshot();
    const savedTable = { ...table, ...tableDrafts[id], ...updates };
    const saved = await updateTable(id, tableUpdate(savedTable));
    if (saved) {
      const after = captureSnapshot();
      after.tables = after.tables.map((item) => (item.id === id ? savedTable : item));
      recordHistory(before, after);
      setTableDrafts((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    } else {
      toast.error("No se pudo cambiar el tamaño de la mesa");
    }
    historyGestureStartRef.current = null;
  }

  async function handleZoneMoveEnd(
    id: string,
    updates: Pick<TableZone, "position_x" | "position_y">
  ) {
    const zone = zones.find((item) => item.id === id);
    if (!zone) return;
    const before = historyGestureStartRef.current ?? captureSnapshot();
    const savedZone = { ...zone, ...zoneDrafts[id], ...updates };
    const saved = await updateZone(id, zoneUpdate(savedZone));
    if (saved) {
      const after = captureSnapshot();
      after.zones = after.zones.map((item) => (item.id === id ? savedZone : item));
      recordHistory(before, after);
      setZoneDrafts((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    } else {
      toast.error("No se pudo mover la zona");
    }
    historyGestureStartRef.current = null;
  }

  async function handleZoneResizeEnd(
    id: string,
    updates: Pick<TableZone, "width" | "height">
  ) {
    const zone = zones.find((item) => item.id === id);
    if (!zone) return;
    const before = historyGestureStartRef.current ?? captureSnapshot();
    const savedZone = { ...zone, ...zoneDrafts[id], ...updates };
    const saved = await updateZone(id, zoneUpdate(savedZone));
    if (!saved) {
      toast.error("No se pudo cambiar el tamaño de la zona");
      historyGestureStartRef.current = null;
      return;
    }

    const relatedTables = tables.filter(
      (table) => table.zone_id === id && tableDrafts[table.id]
    );
    const tableResults = await Promise.all(
      relatedTables.map((table) =>
        updateTable(table.id, tableUpdate({ ...table, ...tableDrafts[table.id] }))
      )
    );
    if (tableResults.every(Boolean)) {
      const after = captureSnapshot();
      after.zones = after.zones.map((item) => (item.id === id ? savedZone : item));
      after.tables = after.tables.map((item) => {
        const related = relatedTables.find((table) => table.id === item.id);
        return related ? { ...item, ...tableDrafts[related.id] } : item;
      });
      recordHistory(before, after);
      setZoneDrafts((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      if (relatedTables.length > 0) {
        setTableDrafts((current) => {
          const next = { ...current };
          relatedTables.forEach((table) => delete next[table.id]);
          return next;
        });
      }
    } else {
      toast.error("La zona cambió, pero no se pudieron guardar todas sus mesas");
    }
    historyGestureStartRef.current = null;
  }

  async function handleSaveAll() {
    if (zones.length === 0 && tables.length === 0) return;
    const before = captureSnapshot();
    setSaving(true);
    try {
      const [zoneResults, tableResults, labelResults] = await Promise.all([
        Promise.all(
          zones.map((zone) =>
            updateZone(zone.id, zoneUpdate({ ...zone, ...zoneDrafts[zone.id] }))
          )
        ),
        Promise.all(
          tables.map((table) =>
            updateTable(table.id, tableUpdate({ ...table, ...tableDrafts[table.id] }))
          )
        ),
        Promise.all(
          labels.map((label) =>
            updateLabel(label.id, labelUpdate({ ...label, ...labelDrafts[label.id] }))
          )
        ),
      ]);
      if ([...zoneResults, ...tableResults, ...labelResults].every(Boolean)) {
        const after = captureSnapshot();
        after.zones = after.zones.map((zone) => ({ ...zone, ...zoneDrafts[zone.id] }));
        after.tables = after.tables.map((table) => ({ ...table, ...tableDrafts[table.id] }));
        after.labels = after.labels.map((label) => ({ ...label, ...labelDrafts[label.id] }));
        recordHistory(before, after);
        setZoneDrafts({});
        setTableDrafts({});
        setLabelDrafts({});
        toast.success("Mapa guardado");
      } else {
        toast.error("Algunos cambios no se pudieron guardar");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveSelectedZone() {
    if (!editingZone) return;
    if (!editingZone.name.trim()) {
      toast.error("Escribe un nombre para la zona");
      return;
    }
    const before = historyEditStartRef.current ?? captureSnapshot();
    setSaving(true);
    try {
      const saved = await updateZone(editingZone.id, zoneUpdate(editingZone));
      if (!saved) {
        toast.error("No se pudo guardar la zona");
        return;
      }
      const after = captureSnapshot();
      after.zones = after.zones.map((zone) =>
        zone.id === editingZone.id ? editingZone : zone
      );
      recordHistory(before, after);
      setZoneDrafts((current) => {
        const next = { ...current };
        delete next[editingZone.id];
        return next;
      });
      closeInspector();
      toast.success("Zona guardada");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveSelectedTable() {
    if (!editingTable) return;
    if (!editingTable.name.trim()) {
      toast.error("Escribe un nombre para la mesa");
      return;
    }
    const before = historyEditStartRef.current ?? captureSnapshot();
    setSaving(true);
    try {
      const saved = await updateTable(editingTable.id, tableUpdate(editingTable));
      if (!saved) {
        toast.error("No se pudo guardar la mesa");
        return;
      }
      const after = captureSnapshot();
      after.tables = after.tables.map((table) =>
        table.id === editingTable.id ? editingTable : table
      );
      recordHistory(before, after);
      setTableDrafts((current) => {
        const next = { ...current };
        delete next[editingTable.id];
        return next;
      });
      closeInspector();
      toast.success("Mesa guardada");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveSelectedLabel() {
    if (!editingLabel) return;
    if (!editingLabel.label_text.trim()) {
      toast.error("Escribe un texto para la referencia");
      return;
    }
    const before = historyEditStartRef.current ?? captureSnapshot();
    setSaving(true);
    try {
      const saved = await updateLabel(editingLabel.id, labelUpdate(editingLabel));
      if (!saved) {
        toast.error("No se pudo guardar la referencia");
        return;
      }
      const after = captureSnapshot();
      after.labels = after.labels.map((item) =>
        item.id === editingLabel.id ? editingLabel : item
      );
      recordHistory(before, after);
      setLabelDrafts((current) => {
        const next = { ...current };
        delete next[editingLabel.id];
        return next;
      });
      closeInspector();
      toast.success("Referencia guardada");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivateZone() {
    if (!editingZone) return;
    const tablesInZone = displayTables.filter((table) => table.zone_id === editingZone.id);
    if (tablesInZone.length > 0) {
      toast.error("Mueve las mesas de esta zona antes de desactivarla");
      return;
    }
    if (!window.confirm(`¿Desactivar la zona ${editingZone.name}?`)) return;
    const before = captureSnapshot();
    const updated = await deactivateZone(editingZone.id);
    if (updated) {
      recordHistory(before, {
        ...before,
        zones: before.zones.filter((zone) => zone.id !== editingZone.id),
      });
      setSelectedZoneId("");
      closeInspector();
      toast.success("Zona desactivada");
    } else {
      toast.error("No se pudo desactivar la zona");
    }
  }

  async function handleDeactivateTable() {
    if (!editingTable) return;
    if (!window.confirm(`¿Desactivar ${editingTable.name}?`)) return;
    const before = captureSnapshot();
    const deactivated = await deactivateTable(editingTable.id);
    if (deactivated) {
      recordHistory(before, {
        ...before,
        tables: before.tables.filter((table) => table.id !== editingTable.id),
      });
      setSelectedTableIds((current) => current.filter((id) => id !== editingTable.id));
      setSelectionAnchorId((current) => (current === editingTable.id ? null : current));
      closeInspector();
      toast.success("Mesa desactivada");
    } else {
      toast.error("No se pudo desactivar la mesa");
    }
  }

  async function handleDeactivateLabel() {
    if (!editingLabel) return;
    if (!window.confirm(`¿Eliminar la referencia ${editingLabel.label_text}?`)) return;
    const before = captureSnapshot();
    const deactivated = await deactivateLabel(editingLabel.id);
    if (deactivated) {
      recordHistory(before, {
        ...before,
        labels: before.labels.filter((item) => item.id !== editingLabel.id),
      });
      setSelectedLabelId(null);
      closeInspector();
      toast.success("Referencia eliminada");
    } else {
      toast.error("No se pudo eliminar la referencia");
    }
  }

  async function handleQuickDeleteZone(zone: TableZone) {
    const tablesInZone = displayTables.filter((table) => table.zone_id === zone.id);
    if (tablesInZone.length > 0) {
      toast.error("Mueve las mesas de esta zona antes de borrarla");
      return;
    }
    if (!window.confirm(`¿Borrar la zona ${zone.name}?`)) return;
    const before = captureSnapshot();
    const deleted = await deactivateZone(zone.id);
    if (!deleted) {
      toast.error("No se pudo borrar la zona");
      return;
    }
    recordHistory(before, {
      ...before,
      zones: before.zones.filter((item) => item.id !== zone.id),
    });
    if (selectedZoneId === zone.id) setSelectedZoneId("");
    if (editingEntity?.kind === "zone" && editingEntity.id === zone.id) closeInspector();
    toast.success("Zona borrada");
  }

  async function handleQuickDeleteTable(table: RestaurantTable) {
    if (!window.confirm(`¿Borrar ${table.name}?`)) return;
    const before = captureSnapshot();
    const deleted = await deactivateTable(table.id);
    if (!deleted) {
      toast.error("No se pudo borrar la mesa");
      return;
    }
    recordHistory(before, {
      ...before,
      tables: before.tables.filter((item) => item.id !== table.id),
    });
    if (selectedTableIds.includes(table.id)) {
      setSelectedTableIds((current) => current.filter((id) => id !== table.id));
    }
    setSelectionAnchorId((current) => (current === table.id ? null : current));
    if (editingEntity?.kind === "table" && editingEntity.id === table.id) closeInspector();
    toast.success("Mesa borrada");
  }

  async function handleQuickDeleteLabel(label: TableMapLabel) {
    if (!window.confirm(`¿Borrar la referencia ${label.label_text}?`)) return;
    const before = captureSnapshot();
    const deleted = await deactivateLabel(label.id);
    if (!deleted) {
      toast.error("No se pudo borrar la referencia");
      return;
    }
    recordHistory(before, {
      ...before,
      labels: before.labels.filter((item) => item.id !== label.id),
    });
    if (selectedLabelId === label.id) setSelectedLabelId(null);
    if (editingEntity?.kind === "label" && editingEntity.id === label.id) closeInspector();
    toast.success("Referencia borrada");
  }

  useEffect(() => {
    function handleKeyboardShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;

      const key = event.key.toLowerCase();
      if (key === "escape") {
        keyboardActionsRef.current.clearSelection();
        return;
      }
      if (key === "delete" || key === "backspace") {
        event.preventDefault();
        void keyboardActionsRef.current.deleteSelection();
        return;
      }
      if (key === "enter" || key === "e") {
        event.preventDefault();
        keyboardActionsRef.current.editSelected();
        return;
      }
      if (!(event.ctrlKey || event.metaKey)) return;
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) void keyboardActionsRef.current.redo();
        else void keyboardActionsRef.current.undo();
      } else if (key === "y") {
        event.preventDefault();
        void keyboardActionsRef.current.redo();
      } else if (key === "c") {
        event.preventDefault();
        keyboardActionsRef.current.copy();
      } else if (key === "x") {
        event.preventDefault();
        void keyboardActionsRef.current.cut();
      } else if (key === "v") {
        event.preventDefault();
        void keyboardActionsRef.current.paste();
      } else if (key === "a") {
        event.preventDefault();
        keyboardActionsRef.current.selectAll();
      }
    }

    window.addEventListener("keydown", handleKeyboardShortcut);
    return () => window.removeEventListener("keydown", handleKeyboardShortcut);
  }, []);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 shadow-sm sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/dashboard"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-raised text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Volver al dashboard"
          >
            <ArrowLeft size={18} />
          </Link>
          <div className="min-w-0">
            <p className="truncate font-heading text-lg font-bold text-foreground">Mapa de mesas</p>
            <p className="truncate font-body text-xs text-muted-foreground">
              Organiza todas las zonas en un solo plano
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSaveAll}
          disabled={saving || loading || (zones.length === 0 && tables.length === 0)}
          className="action-success inline-flex h-11 shrink-0 items-center gap-2 rounded-xl px-3 font-heading text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50 sm:px-4"
        >
          <Save size={15} />
          <span className="hidden sm:inline">{saving ? "Guardando..." : "Guardar mapa"}</span>
          <span className="sm:hidden">Guardar</span>
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
        <aside className="w-full shrink-0 border-b border-border bg-surface px-4 py-3 xl:w-64 xl:border-b-0 xl:border-r xl:p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="font-heading text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Zonas
              </p>
              <p className="mt-1 font-body text-xs text-muted-foreground">
                Selecciona una zona para ver sus acciones
              </p>
            </div>
            <LayoutGrid size={18} className="shrink-0 text-brand" />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 xl:flex-col xl:overflow-visible">
            {displayZones.map((zone) => {
              const count = displayTables.filter((table) => table.zone_id === zone.id).length;
              return (
                <div key={zone.id} className="group flex min-w-[10rem] shrink-0 items-center gap-1 xl:min-w-0">
                  <button
                    type="button"
                    onClick={() => focusZone(zone)}
                    className={`flex min-h-12 min-w-0 flex-1 items-center justify-between gap-3 rounded-xl px-3 text-left font-heading text-sm font-bold transition-colors ${
                      selectedZoneId === zone.id
                        ? "bg-ink text-white"
                        : "bg-background text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span className="truncate">{zone.name}</span>
                    <span className="rounded-md bg-surface-raised px-1.5 py-0.5 font-data text-xs opacity-80">
                      {count}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => editZone(zone)}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
                    aria-label={`Editar ${zone.name}`}
                    title={`Editar ${zone.name}`}
                  >
                    <Pencil size={15} />
                  </button>
                </div>
              );
            })}
          </div>

          <form onSubmit={handleAddZone} className="mt-3 flex gap-2 xl:mt-4">
            <input
              value={newZoneName}
              onChange={(event) => setNewZoneName(event.target.value)}
              placeholder="Nueva zona"
              aria-label="Nombre de la nueva zona"
              className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 font-body text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-brand focus:ring-4 focus:ring-brand/15"
            />
            <button
              type="submit"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand text-white transition-colors hover:bg-brand-hover"
              aria-label="Agregar zona"
            >
              <Plus size={17} />
            </button>
          </form>
        </aside>

        <main className="pos-scroll min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
          {!loading && zones.length === 0 ? (
            <div className="mx-auto flex min-h-[26rem] max-w-xl flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-surface p-8 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-light text-brand">
                <LayoutGrid size={26} />
              </div>
              <h1 className="font-heading text-lg font-bold">Crea tu primera zona</h1>
              <p className="mt-2 max-w-sm font-body text-sm text-muted-foreground">
                Empieza por una zona como Salón, Terraza o Reservado. Después podrás colocar las mesas sobre el mapa.
              </p>
            </div>
          ) : (
            <div className="mx-auto max-w-7xl">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3 sm:mb-4">
                <div>
                  <p className="font-data text-xs uppercase tracking-[0.18em] text-muted-foreground">Plano completo</p>
                  <h1 className="mt-1 font-heading text-2xl font-bold text-foreground">
                    {selectedZone?.name ?? "Todas las zonas"}
                  </h1>
                  <p className="mt-1 font-body text-sm text-muted-foreground">
                    {selectedZone
                      ? `${displayTables.filter((table) => table.zone_id === selectedZone.id).length} mesas en esta zona`
                      : `${displayZones.length} zonas y ${displayTables.length} mesas visibles`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleUndo}
                    disabled={!canUndo || saving}
                    aria-label="Deshacer"
                    title="Deshacer (Ctrl/Cmd + Z)"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface text-muted-foreground transition-colors hover:border-brand/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <Undo2 size={17} />
                  </button>
                  <button
                    type="button"
                    onClick={handleRedo}
                    disabled={!canRedo || saving}
                    aria-label="Rehacer"
                    title="Rehacer (Ctrl/Cmd + Shift + Z)"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface text-muted-foreground transition-colors hover:border-brand/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <Redo2 size={17} />
                  </button>
                  {clipboardTables.length > 0 ? (
                    <button
                      type="button"
                      onClick={handlePasteSelection}
                      disabled={saving}
                      className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3 font-heading text-xs font-bold text-muted-foreground transition-colors hover:border-brand/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 sm:text-sm"
                    >
                      <ClipboardPaste size={16} />
                      Pegar
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleAddTable}
                    disabled={displayZones.length === 0 || saving}
                    className="inline-flex h-11 items-center gap-2 rounded-xl bg-ink px-3 font-heading text-xs font-bold text-white transition-colors hover:bg-brand disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 sm:text-sm"
                  >
                    <Plus size={17} />
                    Agregar mesa
                  </button>
                  <button
                    type="button"
                    onClick={handleAddLabel}
                    disabled={saving}
                    className="inline-flex h-11 items-center gap-2 rounded-xl border border-brand/50 bg-brand-light px-3 font-heading text-xs font-bold text-brand transition-colors hover:border-brand hover:bg-brand/15 disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 sm:text-sm"
                  >
                    <Tag size={16} />
                    <span className="hidden sm:inline">Agregar referencia</span>
                    <span className="sm:hidden">Referencia</span>
                  </button>
                </div>
              </div>

              {selectedTableIds.length > 0 ? (
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface p-2.5 shadow-sm sm:mb-4 sm:p-3">
                  <span className="mr-auto px-1 font-heading text-xs font-bold text-foreground">
                    {`${selectedTableIds.length} ${selectedTableIds.length === 1 ? "mesa seleccionada" : "mesas seleccionadas"}`}
                    <span className="ml-2 hidden font-body text-[11px] font-normal text-muted-foreground sm:inline">
                      Ctrl/Cmd + clic para agregar
                    </span>
                  </span>
                  {selectedTableId && selectedTables[0] ? (
                    <button
                      type="button"
                      onClick={() => editTable(selectedTables[0])}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-brand/40 bg-brand-light px-2.5 font-heading text-[11px] font-bold text-brand transition-colors hover:border-brand"
                    >
                      <Pencil size={14} />
                      Editar mesa
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    disabled={displayTables.length === 0}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 font-heading text-[11px] font-bold text-muted-foreground transition-colors hover:border-brand/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ListChecks size={14} />
                    Todas
                  </button>
                  <>
                      <button
                        type="button"
                        onClick={handleCopySelection}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 font-heading text-[11px] font-bold text-muted-foreground transition-colors hover:border-brand/50 hover:text-foreground"
                      >
                        <Copy size={14} />
                        Copiar
                      </button>
                      <button
                        type="button"
                        onClick={handleCutSelection}
                        disabled={saving}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 font-heading text-[11px] font-bold text-muted-foreground transition-colors hover:border-brand/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Scissors size={14} />
                        Cortar
                      </button>
                      <button
                        type="button"
                        onClick={handleDuplicateSelection}
                        disabled={saving}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 font-heading text-[11px] font-bold text-muted-foreground transition-colors hover:border-brand/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Copy size={14} />
                        Duplicar
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteSelection}
                        disabled={saving}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-destructive/10 px-2.5 font-heading text-[11px] font-bold text-destructive transition-colors hover:bg-destructive/20 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Trash2 size={14} />
                        Eliminar
                      </button>
                  </>
                </div>
              ) : null}

              {selectedLabel ? (
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-brand/35 bg-surface p-2.5 shadow-sm sm:mb-4 sm:p-3">
                  <span className="mr-auto flex min-w-0 items-center gap-2 px-1 font-heading text-xs font-bold text-foreground">
                    <Tag size={15} className="shrink-0 text-brand" />
                    <span className="truncate">Referencia: {selectedLabel.label_text}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => editLabel(selectedLabel)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-brand/40 bg-brand-light px-2.5 font-heading text-[11px] font-bold text-brand transition-colors hover:border-brand"
                  >
                    <Pencil size={14} />
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickDeleteLabel(selectedLabel)}
                    disabled={saving}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-destructive/10 px-2.5 font-heading text-[11px] font-bold text-destructive transition-colors hover:bg-destructive/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Trash2 size={14} />
                    Eliminar
                  </button>
                </div>
              ) : null}

              <TableFloorMap
                zones={displayZones}
                tables={displayTables}
                labels={displayLabels}
                selectedTableId={selectedTableId}
                selectedTableIds={selectedTableIds}
                selectedZoneId={selectedZoneId}
                selectedLabelId={selectedLabelId}
                editable
                className="w-full"
                onSelectZone={focusZone}
                onEditZone={editZone}
                onDeleteZone={handleQuickDeleteZone}
                onSelectTable={focusTable}
                onEditTable={editTable}
                onDeleteTable={handleQuickDeleteTable}
                onMoveZone={updateDraftZone}
                onMoveZoneEnd={handleZoneMoveEnd}
                onMoveTable={updateDraftTable}
                onMoveTableEnd={handleTableMoveEnd}
                onResizeTable={updateDraftTable}
                onResizeTableEnd={handleTableResizeEnd}
                onResizeZone={resizeDraftZone}
                onResizeZoneEnd={handleZoneResizeEnd}
                onSelectLabel={focusLabel}
                onEditLabel={editLabel}
                onDeleteLabel={handleQuickDeleteLabel}
                onMoveLabel={updateDraftLabel}
                onMoveLabelEnd={handleLabelMoveEnd}
                onResizeLabel={updateDraftLabel}
                onResizeLabelEnd={handleLabelResizeEnd}
                onTableInteractionStart={beginHistoryGesture}
                onTableResizeStart={beginHistoryGesture}
                onZoneInteractionStart={beginHistoryGesture}
                onZoneResizeStart={beginHistoryGesture}
                onLabelInteractionStart={beginHistoryGesture}
                onLabelResizeStart={beginHistoryGesture}
              />
            </div>
          )}
        </main>
      </div>

      {(editingZone || editingTable || editingLabel) && (
        <TableLayoutInspector
          zone={editingZone}
          table={editingTable}
          label={editingLabel}
          zones={displayZones}
          tableCount={editingZoneTableCount}
          saving={saving}
          onClose={closeInspector}
          onChangeZone={(updates) => {
            if (!editingZone) return;
            const next = { ...editingZone, ...updates };
            const safeUpdates = { ...updates };
            if (updates.width !== undefined) {
              safeUpdates.position_x = Math.min(
                Math.max(next.position_x, 0.01),
                0.99 - next.width
              );
            }
            if (updates.height !== undefined) {
              safeUpdates.position_y = Math.min(
                Math.max(next.position_y, 0.01),
                0.99 - next.height
              );
            }
            if (updates.width !== undefined || updates.height !== undefined) {
              resizeDraftZone(editingZone.id, safeUpdates);
            } else {
              updateDraftZone(editingZone.id, safeUpdates);
            }
          }}
          onChangeTable={(updates) => {
            if (!editingTable) return;
            updateDraftTable(editingTable.id, updates);
            if (updates.zone_id) setSelectedZoneId(updates.zone_id);
          }}
          onChangeLabel={(updates) => {
            if (!editingLabel) return;
            updateDraftLabel(editingLabel.id, updates);
          }}
          onSaveZone={handleSaveSelectedZone}
          onSaveTable={handleSaveSelectedTable}
          onSaveLabel={handleSaveSelectedLabel}
          onDeactivateZone={handleDeactivateZone}
          onDeactivateTable={handleDeactivateTable}
          onDeactivateLabel={handleDeactivateLabel}
        />
      )}
    </div>
  );
}
