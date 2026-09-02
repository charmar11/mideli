"use client";

import { useRef } from "react";
import { MapPin, Move, MoveDiagonal2, Pencil, Tag, Trash2, Users } from "lucide-react";
import type { RestaurantTable, TableMapLabel, TableShape, TableZone } from "@/types/database";

type TablePosition = Pick<RestaurantTable, "position_x" | "position_y">;
type ZonePosition = Pick<TableZone, "position_x" | "position_y">;
type TableResize = Pick<RestaurantTable, "position_x" | "position_y" | "width" | "height">;
type ZoneResize = Pick<TableZone, "width" | "height">;
type LabelPosition = Pick<TableMapLabel, "position_x" | "position_y">;
type LabelResize = Pick<TableMapLabel, "width" | "height">;
type TableCollision = Pick<RestaurantTable, "position_x" | "position_y" | "width" | "height">;

const GRID_SIZE_PX = 28;

interface TableFloorMapProps {
  zones: TableZone[];
  tables: RestaurantTable[];
  labels?: TableMapLabel[];
  selectedTableId?: string | null;
  selectedTableIds?: string[];
  selectedZoneId?: string | null;
  selectedLabelId?: string | null;
  editable?: boolean;
  selectionMode?: boolean;
  fitSingleZone?: boolean;
  showLabels?: boolean;
  className?: string;
  onSelectTable?: (table: RestaurantTable, event?: React.MouseEvent<HTMLButtonElement>) => void;
  onEditTable?: (table: RestaurantTable) => void;
  onDeleteTable?: (table: RestaurantTable) => void;
  onSelectZone?: (zone: TableZone) => void;
  onEditZone?: (zone: TableZone) => void;
  onDeleteZone?: (zone: TableZone) => void;
  onMoveTable?: (tableId: string, updates: TablePosition) => void;
  onMoveTableEnd?: (tableId: string, updates: TablePosition) => void;
  onResizeTable?: (tableId: string, updates: TableResize) => void;
  onResizeTableEnd?: (tableId: string, updates: TableResize) => void;
  onMoveZone?: (zoneId: string, updates: ZonePosition) => void;
  onMoveZoneEnd?: (zoneId: string, updates: ZonePosition) => void;
  onResizeZone?: (zoneId: string, updates: ZoneResize) => void;
  onResizeZoneEnd?: (zoneId: string, updates: ZoneResize) => void;
  onSelectLabel?: (label: TableMapLabel) => void;
  onEditLabel?: (label: TableMapLabel) => void;
  onDeleteLabel?: (label: TableMapLabel) => void;
  onMoveLabel?: (labelId: string, updates: LabelPosition) => void;
  onMoveLabelEnd?: (labelId: string, updates: LabelPosition) => void;
  onResizeLabel?: (labelId: string, updates: LabelResize) => void;
  onResizeLabelEnd?: (labelId: string, updates: LabelResize) => void;
  onTableInteractionStart?: (table: RestaurantTable) => void;
  onTableResizeStart?: (table: RestaurantTable) => void;
  onZoneInteractionStart?: (zone: TableZone) => void;
  onZoneResizeStart?: (zone: TableZone) => void;
  onLabelInteractionStart?: (label: TableMapLabel) => void;
  onLabelResizeStart?: (label: TableMapLabel) => void;
}

type DragState =
  | {
      kind: "table";
      id: string;
      zoneId: string;
      offsetX: number;
      offsetY: number;
      width: number;
      height: number;
      startClientX: number;
      startClientY: number;
      moved: boolean;
      latest: TablePosition;
      otherTables: TableCollision[];
    }
  | {
      kind: "resize-table";
      id: string;
      zoneId: string;
      startWidth: number;
      startHeight: number;
      startPositionX: number;
      startPositionY: number;
      startClientX: number;
      startClientY: number;
      moved: boolean;
      latest: TableResize;
      otherTables: TableCollision[];
    }
  | {
      kind: "zone";
      id: string;
      offsetX: number;
      offsetY: number;
      width: number;
      height: number;
      startClientX: number;
      startClientY: number;
      moved: boolean;
      latest: ZonePosition;
    }
  | {
      kind: "resize-zone";
      id: string;
      startWidth: number;
      startHeight: number;
      startClientX: number;
      startClientY: number;
      moved: boolean;
      latest: ZoneResize;
    }
  | {
      kind: "label";
      id: string;
      offsetX: number;
      offsetY: number;
      width: number;
      height: number;
      startClientX: number;
      startClientY: number;
      moved: boolean;
      latest: LabelPosition;
    }
  | {
      kind: "resize-label";
      id: string;
      startWidth: number;
      startHeight: number;
      startPositionX: number;
      startPositionY: number;
      startClientX: number;
      startClientY: number;
      moved: boolean;
      latest: LabelResize;
    };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function numberOr(value: number | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function snapToGrid(value: number, step: number) {
  return step > 0 ? Math.round(value / step) * step : value;
}

function snapClamped(value: number, min: number, max: number, step: number) {
  return clamp(snapToGrid(value, step), min, max);
}

function tableRectsOverlap(first: TableCollision, second: TableCollision) {
  const horizontalOverlap =
    Math.abs(first.position_x - second.position_x) < (first.width + second.width) / 2;
  const verticalOverlap =
    Math.abs(first.position_y - second.position_y) < (first.height + second.height) / 2;
  return horizontalOverlap && verticalOverlap;
}

function alignTablePosition(
  candidate: TablePosition,
  otherTables: TableCollision[],
  stepX: number,
  stepY: number
) {
  const aligned = { ...candidate };
  const toleranceX = Math.max(stepX * 0.9, 0.04);
  const toleranceY = Math.max(stepY * 0.9, 0.04);
  const nearestX = otherTables
    .map((other) => ({ value: other.position_x, distance: Math.abs(other.position_x - candidate.position_x) }))
    .filter((item) => item.distance <= toleranceX)
    .sort((first, second) => first.distance - second.distance)[0];
  const nearestY = otherTables
    .map((other) => ({ value: other.position_y, distance: Math.abs(other.position_y - candidate.position_y) }))
    .filter((item) => item.distance <= toleranceY)
    .sort((first, second) => first.distance - second.distance)[0];

  if (nearestX) aligned.position_x = nearestX.value;
  if (nearestY) aligned.position_y = nearestY.value;
  return aligned;
}

function safeTableResize(
  candidate: TableResize,
  otherTables: TableCollision[],
  minimumWidth: number,
  minimumHeight: number,
  stepX: number,
  stepY: number,
  fallback: TableResize
) {
  const safe = { ...candidate };
  let attempts = 0;
  while (
    otherTables.some((other) => tableRectsOverlap(safe, other)) &&
    attempts < 30 &&
    (safe.width > minimumWidth || safe.height > minimumHeight)
  ) {
    const widthRoom = safe.width - minimumWidth;
    const heightRoom = safe.height - minimumHeight;
    if (heightRoom >= widthRoom && safe.height > minimumHeight) {
      safe.height = Math.max(minimumHeight, safe.height - stepY);
      safe.position_y = candidate.position_y - (candidate.height - safe.height) / 2;
    } else if (safe.width > minimumWidth) {
      safe.width = Math.max(minimumWidth, safe.width - stepX);
      safe.position_x = candidate.position_x - (candidate.width - safe.width) / 2;
    } else {
      break;
    }
    attempts += 1;
  }

  return otherTables.some((other) => tableRectsOverlap(safe, other)) ? fallback : safe;
}

function tableDisplaySize(table: RestaurantTable) {
  return {
    width: clamp(numberOr(table.width, 0.28), 0.14, 0.65),
    height: clamp(numberOr(table.height, 0.2), 0.12, 0.7),
  };
}

function collisionTable(table: RestaurantTable): TableCollision {
  const size = tableDisplaySize(table);
  return {
    position_x: numberOr(table.position_x, 0.5),
    position_y: numberOr(table.position_y, 0.45),
    width: size.width,
    height: size.height,
  };
}

function findFreeTablePosition(
  candidate: TablePosition,
  movingTable: Pick<TableCollision, "width" | "height">,
  otherTables: TableCollision[],
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  stepX: number,
  stepY: number,
  fallback: TablePosition
) {
  const directions = [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ];

  for (let radius = 0; radius <= 10; radius += 1) {
    for (const [directionX, directionY] of directions) {
      const possible: TableCollision = {
        position_x: clamp(candidate.position_x + directionX * radius * stepX, minX, maxX),
        position_y: clamp(candidate.position_y + directionY * radius * stepY, minY, maxY),
        width: movingTable.width,
        height: movingTable.height,
      };
      const snapped = {
        position_x: snapClamped(possible.position_x, minX, maxX, stepX),
        position_y: snapClamped(possible.position_y, minY, maxY, stepY),
      };
      if (
        !otherTables.some((other) =>
          tableRectsOverlap({ ...snapped, ...movingTable }, other)
        )
      ) {
        return snapped;
      }
    }
  }

  return fallback;
}

function shapeClass(shape: TableShape) {
  if (shape === "round") return "rounded-full";
  if (shape === "bar") return "rounded-xl";
  if (shape === "rectangle") return "rounded-2xl";
  return "rounded-xl";
}

export function TableFloorMap({
  zones,
  tables,
  labels = [],
  selectedTableId = null,
  selectedTableIds = [],
  selectedZoneId = null,
  selectedLabelId = null,
  editable = false,
  selectionMode = false,
  fitSingleZone = false,
  showLabels = true,
  className = "",
  onSelectTable,
  onEditTable,
  onDeleteTable,
  onSelectZone,
  onEditZone,
  onDeleteZone,
  onMoveTable,
  onMoveTableEnd,
  onResizeTable,
  onResizeTableEnd,
  onMoveZone,
  onMoveZoneEnd,
  onResizeZone,
  onResizeZoneEnd,
  onSelectLabel,
  onEditLabel,
  onDeleteLabel,
  onMoveLabel,
  onMoveLabelEnd,
  onResizeLabel,
  onResizeLabelEnd,
  onTableInteractionStart,
  onTableResizeStart,
  onZoneInteractionStart,
  onZoneResizeStart,
  onLabelInteractionStart,
  onLabelResizeStart,
}: TableFloorMapProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const zoneRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    if (!drag || !canvas) return;

    const canvasBounds = canvas.getBoundingClientRect();
    const pointerX = (event.clientX - canvasBounds.left) / canvasBounds.width;
    const pointerY = (event.clientY - canvasBounds.top) / canvasBounds.height;

    if (!drag.moved && Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY) > 6) {
      drag.moved = true;
      suppressClickRef.current = true;
    }

    if (drag.kind === "label") {
      const next = {
        position_x: snapClamped(
          pointerX - drag.offsetX,
          0.01,
          Math.max(0.01, 0.99 - drag.width),
          GRID_SIZE_PX / canvasBounds.width
        ),
        position_y: snapClamped(
          pointerY - drag.offsetY,
          0.01,
          Math.max(0.01, 0.99 - drag.height),
          GRID_SIZE_PX / canvasBounds.height
        ),
      };
      drag.latest = next;
      onMoveLabel?.(drag.id, next);
      return;
    }

    if (drag.kind === "resize-label") {
      const next = {
        width: snapClamped(
          drag.startWidth + (event.clientX - drag.startClientX) / canvasBounds.width,
          0.12,
          Math.min(0.82, 0.99 - drag.startPositionX),
          GRID_SIZE_PX / canvasBounds.width
        ),
        height: snapClamped(
          drag.startHeight + (event.clientY - drag.startClientY) / canvasBounds.height,
          0.08,
          Math.min(0.58, 0.99 - drag.startPositionY),
          GRID_SIZE_PX / canvasBounds.height
        ),
      };
      drag.latest = next;
      onResizeLabel?.(drag.id, next);
      return;
    }

    if (drag.kind === "zone") {
      const next = {
        position_x: snapClamped(
          pointerX - drag.offsetX,
          0.01,
          0.99 - drag.width,
          GRID_SIZE_PX / canvasBounds.width
        ),
        position_y: snapClamped(
          pointerY - drag.offsetY,
          0.01,
          0.99 - drag.height,
          GRID_SIZE_PX / canvasBounds.height
        ),
      };
      drag.latest = next;
      onMoveZone?.(drag.id, next);
      return;
    }

    if (drag.kind === "resize-zone") {
      const next = {
        width: snapClamped(
          drag.startWidth + (event.clientX - drag.startClientX) / canvasBounds.width,
          0.18,
          0.9,
          GRID_SIZE_PX / canvasBounds.width
        ),
        height: snapClamped(
          drag.startHeight + (event.clientY - drag.startClientY) / canvasBounds.height,
          0.16,
          0.8,
          GRID_SIZE_PX / canvasBounds.height
        ),
      };
      drag.latest = next;
      onResizeZone?.(drag.id, next);
      return;
    }

    const zone = zoneRefs.current[drag.zoneId];
    if (!zone) return;
    const zoneBounds = zone.getBoundingClientRect();

    if (drag.kind === "resize-table") {
      const deltaX = (event.clientX - drag.startClientX) / zoneBounds.width;
      const deltaY = (event.clientY - drag.startClientY) / zoneBounds.height;
      const left = drag.startPositionX - drag.startWidth / 2;
      const top = drag.startPositionY - drag.startHeight / 2;
      const width = snapClamped(
        drag.startWidth + deltaX,
        0.14,
        Math.min(0.65, 1 - left),
        GRID_SIZE_PX / zoneBounds.width
      );
      const height = snapClamped(
        drag.startHeight + deltaY,
        0.12,
        Math.min(0.7, 1 - top),
        GRID_SIZE_PX / zoneBounds.height
      );
      const candidate: TableResize = {
        position_x: left + width / 2,
        position_y: top + height / 2,
        width,
        height,
      };
      const next = safeTableResize(
        candidate,
        drag.otherTables,
        0.14,
        0.12,
        GRID_SIZE_PX / zoneBounds.width,
        GRID_SIZE_PX / zoneBounds.height,
        drag.latest
      );
      if (next.width !== drag.latest.width || next.height !== drag.latest.height) {
        drag.latest = next;
        onResizeTable?.(drag.id, next);
      }
      return;
    }

    const minX = Math.max(0.04, drag.width / 2);
    const maxX = Math.min(0.96, 1 - drag.width / 2);
    const minY = Math.max(0.08, drag.height / 2);
    const maxY = Math.min(0.92, 1 - drag.height / 2);
    const candidate = {
      position_x: snapClamped(
        (event.clientX - zoneBounds.left) / zoneBounds.width - drag.offsetX,
        minX,
        maxX,
        GRID_SIZE_PX / zoneBounds.width
      ),
      position_y: snapClamped(
        (event.clientY - zoneBounds.top) / zoneBounds.height - drag.offsetY,
        minY,
        maxY,
        GRID_SIZE_PX / zoneBounds.height
      ),
    };
    const aligned = alignTablePosition(
      candidate,
      drag.otherTables,
      GRID_SIZE_PX / zoneBounds.width,
      GRID_SIZE_PX / zoneBounds.height
    );
    const next = findFreeTablePosition(
      aligned,
      drag,
      drag.otherTables,
      minX,
      maxX,
      minY,
      maxY,
      GRID_SIZE_PX / zoneBounds.width,
      GRID_SIZE_PX / zoneBounds.height,
      drag.latest
    );
    drag.latest = next;
    onMoveTable?.(drag.id, next);
  }

  function finishPointer(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;

    if (canvasRef.current?.hasPointerCapture(event.pointerId)) {
      canvasRef.current.releasePointerCapture(event.pointerId);
    }

    if (drag.moved) {
      if (drag.kind === "zone") {
        onMoveZoneEnd?.(drag.id, drag.latest);
      } else if (drag.kind === "table") {
        onMoveTableEnd?.(drag.id, drag.latest);
      } else if (drag.kind === "resize-zone") {
        onResizeZoneEnd?.(drag.id, drag.latest);
      } else if (drag.kind === "label") {
        onMoveLabelEnd?.(drag.id, drag.latest);
      } else if (drag.kind === "resize-label") {
        onResizeLabelEnd?.(drag.id, drag.latest);
      } else {
        onResizeTableEnd?.(drag.id, drag.latest);
      }
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
    dragRef.current = null;
  }

  function selectAfterTap(callback: () => void) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    callback();
  }

  function startLabelDrag(
    event: React.PointerEvent<HTMLButtonElement>,
    label: TableMapLabel
  ) {
    event.stopPropagation();
    if (event.button !== 0) return;
    if (!editable || !onMoveLabel) return;

    const canvas = canvasRef.current;
    const labelBounds = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!canvas || !labelBounds) return;
    const canvasBounds = canvas.getBoundingClientRect();
    const positionX = numberOr(label.position_x, 0.4);
    const positionY = numberOr(label.position_y, 0.08);
    onLabelInteractionStart?.(label);
    dragRef.current = {
      kind: "label",
      id: label.id,
      offsetX: (event.clientX - labelBounds.left) / canvasBounds.width,
      offsetY: (event.clientY - labelBounds.top) / canvasBounds.height,
      width: numberOr(label.width, 0.2),
      height: numberOr(label.height, 0.1),
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false,
      latest: { position_x: positionX, position_y: positionY },
    };
    canvas.setPointerCapture(event.pointerId);
  }

  function startLabelResize(
    event: React.PointerEvent<HTMLButtonElement>,
    label: TableMapLabel
  ) {
    if (!editable || !onResizeLabel) return;
    event.stopPropagation();
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    onLabelResizeStart?.(label);
    dragRef.current = {
      kind: "resize-label",
      id: label.id,
      startWidth: numberOr(label.width, 0.2),
      startHeight: numberOr(label.height, 0.1),
      startPositionX: numberOr(label.position_x, 0.4),
      startPositionY: numberOr(label.position_y, 0.08),
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false,
      latest: {
        width: numberOr(label.width, 0.2),
        height: numberOr(label.height, 0.1),
      },
    };
    canvas.setPointerCapture(event.pointerId);
  }

  function startZoneDrag(event: React.PointerEvent<HTMLElement>, zone: TableZone) {
    if (!editable || !onMoveZone) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const zoneBounds = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!zoneBounds) return;

    onZoneInteractionStart?.(zone);

    dragRef.current = {
      kind: "zone",
      id: zone.id,
      offsetX: (event.clientX - zoneBounds.left) / bounds.width,
      offsetY: (event.clientY - zoneBounds.top) / bounds.height,
      width: numberOr(zone.width, 0.29),
      height: numberOr(zone.height, 0.36),
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false,
      latest: {
        position_x: numberOr(zone.position_x, (zoneBounds.left - bounds.left) / bounds.width),
        position_y: numberOr(zone.position_y, (zoneBounds.top - bounds.top) / bounds.height),
      },
    };
    canvas.setPointerCapture(event.pointerId);
  }

  function startTableDrag(
    event: React.PointerEvent<HTMLButtonElement>,
    table: RestaurantTable
  ) {
    event.stopPropagation();
    if (event.button !== 0) return;
    if (!editable || !onMoveTable || !table.zone_id) return;

    const zone = zoneRefs.current[table.zone_id];
    if (!zone) return;
    const zoneBounds = zone.getBoundingClientRect();
    const zoneTables = tables.filter((item) => item.zone_id === table.zone_id);
    const displaySize = tableDisplaySize(table);
    const pointerX = (event.clientX - zoneBounds.left) / zoneBounds.width;
    const pointerY = (event.clientY - zoneBounds.top) / zoneBounds.height;
    const latest = {
      position_x: Number(table.position_x),
      position_y: Number(table.position_y),
    };
    onTableInteractionStart?.(table);
    dragRef.current = {
      kind: "table",
      id: table.id,
      zoneId: table.zone_id,
      offsetX: pointerX - numberOr(table.position_x, 0.5),
      offsetY: pointerY - numberOr(table.position_y, 0.45),
      width: displaySize.width,
      height: displaySize.height,
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false,
      latest,
      otherTables: zoneTables
        .filter((item) => item.id !== table.id)
        .map((item) => collisionTable(item)),
    };
    canvasRef.current?.setPointerCapture(event.pointerId);
  }

  function startZoneResize(event: React.PointerEvent<HTMLButtonElement>, zone: TableZone) {
    if (!editable || !onResizeZone) return;
    event.stopPropagation();
    event.preventDefault();
    const canvas = canvasRef.current;
    const zoneBounds = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!canvas || !zoneBounds) return;
    onZoneResizeStart?.(zone);
    dragRef.current = {
      kind: "resize-zone",
      id: zone.id,
      startWidth: numberOr(zone.width, 0.29),
      startHeight: numberOr(zone.height, 0.36),
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false,
      latest: {
        width: numberOr(zone.width, 0.29),
        height: numberOr(zone.height, 0.36),
      },
    };
    canvas.setPointerCapture(event.pointerId);
  }

  function startTableResize(event: React.PointerEvent<HTMLButtonElement>, table: RestaurantTable) {
    if (!editable || !onResizeTable || !table.zone_id) return;
    event.stopPropagation();
    event.preventDefault();
    const canvas = canvasRef.current;
    const zone = zoneRefs.current[table.zone_id];
    if (!canvas || !zone) return;
    const zoneTables = tables.filter((item) => item.zone_id === table.zone_id);
    const displaySize = tableDisplaySize(table);
    onTableResizeStart?.(table);
    dragRef.current = {
      kind: "resize-table",
      id: table.id,
      zoneId: table.zone_id,
      startWidth: displaySize.width,
      startHeight: displaySize.height,
      startPositionX: numberOr(table.position_x, 0.5),
      startPositionY: numberOr(table.position_y, 0.45),
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false,
      latest: {
        position_x: numberOr(table.position_x, 0.5),
        position_y: numberOr(table.position_y, 0.45),
        width: displaySize.width,
        height: displaySize.height,
      },
      otherTables: zoneTables
        .filter((item) => item.id !== table.id)
        .map((item) => collisionTable(item)),
    };
    canvas.setPointerCapture(event.pointerId);
  }

  return (
    <div
      ref={canvasRef}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
      className={`relative touch-pan-y overflow-hidden rounded-3xl border border-border bg-surface shadow-card ${selectionMode ? "h-full min-h-0 aspect-auto select-none" : "min-h-[22rem] aspect-[3/4] sm:aspect-[4/3] sm:min-h-0"} ${className}`}
      style={{
        backgroundImage:
          "linear-gradient(to right, color-mix(in srgb, var(--border) 55%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--border) 55%, transparent) 1px, transparent 1px)",
        backgroundSize: "28px 28px",
      }}
    >
      <div className="pointer-events-none absolute left-4 top-4 z-10 flex items-center gap-2 rounded-full bg-surface/90 px-3 py-1.5 font-body text-[11px] text-muted-foreground shadow-sm">
        {editable ? <Move size={13} /> : <MapPin size={13} />}
        {editable
          ? "Clic selecciona · Ctrl/Cmd agrega · arrastra mueve"
          : "Toca una mesa para seleccionarla"}
      </div>

      {zones.map((zone, zoneIndex) => {
        const zoneTables = tables.filter((table) => table.zone_id === zone.id);
        const selected = selectedZoneId === zone.id;
        const fallbackColumn = zoneIndex % 3;
        const fallbackRow = Math.floor(zoneIndex / 3);
        const singleZoneFitsCanvas = fitSingleZone && zones.length === 1;
        const zoneWidth = singleZoneFitsCanvas
          ? 0.92
          : clamp(numberOr(zone.width, 0.29), 0.18, 0.96);
        const zoneHeight = singleZoneFitsCanvas
          ? 0.86
          : clamp(numberOr(zone.height, 0.36), 0.16, 0.92);
        const zonePositionX = singleZoneFitsCanvas
          ? 0.04
          : clamp(
              numberOr(zone.position_x, 0.04 + fallbackColumn * 0.32),
              0.01,
              Math.max(0.01, 0.99 - zoneWidth)
            );
        const zonePositionY = singleZoneFitsCanvas
          ? 0.1
          : clamp(
              numberOr(zone.position_y, 0.04 + fallbackRow * 0.42),
              0.01,
              Math.max(0.01, 0.99 - zoneHeight)
            );
        return (
          <section
            key={zone.id}
            className={`absolute flex flex-col overflow-hidden rounded-2xl border-2 shadow-card transition-colors ${
              selected
                ? "border-brand"
                : "border-border-strong/80"
            }`}
            style={{
              left: `${zonePositionX * 100}%`,
              top: `${zonePositionY * 100}%`,
              width: `${zoneWidth * 100}%`,
              height: `${zoneHeight * 100}%`,
              zIndex: selected ? 20 : zoneIndex + 1,
              backgroundColor: selected ? "var(--surface)" : "var(--background)",
              backgroundImage:
                "linear-gradient(to right, color-mix(in srgb, var(--border) 38%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--border) 38%, transparent) 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          >
            <div
              onClick={() => selectAfterTap(() => onSelectZone?.(zone))}
              onPointerDown={(event) => startZoneDrag(event, zone)}
              className="flex h-10 shrink-0 touch-none items-center gap-2 border-b border-border/80 bg-surface px-3 text-left"
            >
              <button
                type="button"
                aria-label={`Seleccionar zona ${zone.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  selectAfterTap(() => onSelectZone?.(zone));
                }}
                className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
              >
                <span className="min-w-0 truncate font-heading text-xs font-bold text-foreground">
                  {zone.name}
                </span>
                <span className="flex shrink-0 items-center gap-1 font-data text-[10px] text-muted-foreground">
                  <Users size={12} /> {selectionMode ? `${zoneTables.length} mesas` : zoneTables.length}
                </span>
              </button>
              {editable && selected ? (
                <span className="flex shrink-0 items-center gap-1" onPointerDown={(event) => event.stopPropagation()}>
                  <button
                    type="button"
                    aria-label={`Editar zona ${zone.name}`}
                    title={`Editar ${zone.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onEditZone?.(zone);
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-raised text-muted-foreground transition-colors hover:text-brand"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Borrar zona ${zone.name}`}
                    title={`Borrar ${zone.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onDeleteZone?.(zone);
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-destructive/10 text-destructive transition-colors hover:bg-destructive/20"
                  >
                    <Trash2 size={13} />
                  </button>
                </span>
              ) : null}
            </div>

            <div
              ref={(node) => {
                zoneRefs.current[zone.id] = node;
              }}
              className="relative min-h-0 flex-1"
              onClick={() => selectAfterTap(() => onSelectZone?.(zone))}
            >
              {zoneTables.map((table) => {
                const tableSelected = selectedTableIds.includes(table.id) || selectedTableId === table.id;
                const tableFocused = selectedTableId === table.id;
                const displaySize = tableDisplaySize(table);
                return (
                  <div
                    key={table.id}
                    className="absolute"
                    style={{
                      left: `${clamp(numberOr(table.position_x, 0.5), displaySize.width / 2, 1 - displaySize.width / 2) * 100}%`,
                      top: `${clamp(numberOr(table.position_y, 0.45), displaySize.height / 2, 1 - displaySize.height / 2) * 100}%`,
                      width: `${displaySize.width * 100}%`,
                      height: `${displaySize.height * 100}%`,
                      zIndex: tableSelected ? 15 : undefined,
                      transform: `translate(-50%, -50%) rotate(${Number(table.rotation) || 0}deg)`,
                    }}
                  >
                    <button
                      type="button"
                      aria-label={`${selectionMode ? "Seleccionar" : "Editar"} mesa ${table.name}`}
                      aria-pressed={tableSelected}
                      onClick={(event) => {
                        event.stopPropagation();
                        selectAfterTap(() => onSelectTable?.(table, event));
                      }}
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        onEditTable?.(table);
                      }}
                      onContextMenu={(event) => {
                        if (!editable) return;
                        event.preventDefault();
                        event.stopPropagation();
                        onEditTable?.(table);
                      }}
                      onPointerDown={(event) => startTableDrag(event, table)}
                      className={`flex h-full w-full touch-none flex-col items-center justify-center gap-1 border-2 px-2 shadow-card transition-shadow ${shapeClass(table.shape)} ${
                        tableSelected
                          ? "border-brand bg-brand text-white shadow-float ring-2 ring-brand/30"
                          : "border-ink/20 bg-surface text-foreground hover:border-brand/60"
                      } ${editable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
                      style={selectionMode ? { minWidth: 52, minHeight: 52 } : undefined}
                    >
                      <span className={`max-w-full font-heading font-bold ${selectionMode ? "whitespace-normal break-words text-center text-[11px] leading-tight" : "truncate text-xs"}`}>
                        {table.name}
                      </span>
                      <span className={`flex items-center gap-1 font-data opacity-70 ${selectionMode ? "text-[11px]" : "text-[10px]"}`}>
                        <Users size={11} /> {table.capacity}
                      </span>
                    </button>
                    {editable && tableFocused ? (
                      <button
                        type="button"
                        aria-label={`Cambiar tamaño de ${table.name}`}
                        title="Arrastra para cambiar el tamaño"
                        onClick={(event) => event.stopPropagation()}
                        onPointerDown={(event) => startTableResize(event, table)}
                        className="absolute bottom-0 right-0 z-10 flex h-6 w-6 cursor-nwse-resize items-end justify-end rounded-tl-lg bg-brand p-1 text-white shadow-sm touch-none"
                      >
                        <MoveDiagonal2 size={13} />
                      </button>
                    ) : null}
                    {editable && tableFocused ? (
                      <div
                        className={`absolute left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-border bg-surface p-1 shadow-float ${
                          Number(table.position_y) < 0.36
                            ? "top-[calc(100%+0.35rem)]"
                            : "bottom-[calc(100%+0.35rem)]"
                        }`}
                        onPointerDown={(event) => event.stopPropagation()}
                      >
                        <button
                          type="button"
                          aria-label={`Editar mesa ${table.name}`}
                          title={`Editar ${table.name}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onEditTable?.(table);
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-brand-light hover:text-brand"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          aria-label={`Borrar mesa ${table.name}`}
                          title={`Borrar ${table.name}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onDeleteTable?.(table);
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-destructive transition-colors hover:bg-destructive/10"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {zoneTables.length === 0 ? (
                <span className="absolute inset-0 flex items-center justify-center px-3 text-center font-body text-[10px] text-muted-foreground/70">
                  Sin mesas
                </span>
              ) : null}
            </div>
            {editable && selected ? (
              <button
                type="button"
                aria-label={`Cambiar tamaño de ${zone.name}`}
                title="Arrastra para cambiar el tamaño"
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => startZoneResize(event, zone)}
                className="absolute bottom-0 right-0 z-10 flex h-9 w-9 cursor-nwse-resize items-end justify-end rounded-tl-xl bg-brand p-1 text-white shadow-sm touch-none"
              >
                <MoveDiagonal2 size={16} />
              </button>
            ) : null}
          </section>
        );
      })}

      {showLabels && labels.map((label) => {
        const selected = selectedLabelId === label.id;
        const positionX = numberOr(label.position_x, 0.4);
        const positionY = numberOr(label.position_y, 0.08);
        const width = clamp(numberOr(label.width, 0.2), 0.12, 0.82);
        const height = clamp(numberOr(label.height, 0.1), 0.08, 0.58);
        return (
          <div
            key={label.id}
            className={`absolute z-30 ${editable ? "" : "pointer-events-none"}`}
            style={{
              left: `${positionX * 100}%`,
              top: `${positionY * 100}%`,
              width: `${width * 100}%`,
              height: `${height * 100}%`,
            }}
          >
            <button
              type="button"
              aria-label={`${editable ? "Editar" : "Referencia"}: ${label.label_text}`}
              aria-pressed={selected}
              disabled={!editable}
              onClick={(event) => {
                event.stopPropagation();
                selectAfterTap(() => onSelectLabel?.(label));
              }}
              onDoubleClick={(event) => {
                event.stopPropagation();
                onEditLabel?.(label);
              }}
              onContextMenu={(event) => {
                if (!editable) return;
                event.preventDefault();
                event.stopPropagation();
                onEditLabel?.(label);
              }}
              onPointerDown={(event) => startLabelDrag(event, label)}
              className={`flex h-full w-full touch-none items-center justify-center gap-2 overflow-hidden rounded-xl border-2 px-3 text-center shadow-card transition-shadow ${
                selected ? "shadow-float ring-2 ring-brand/30" : "hover:shadow-float"
              } ${editable ? "cursor-grab active:cursor-grabbing" : "cursor-default pointer-events-none"}`}
              style={{
                backgroundColor: label.background_color,
                color: label.text_color,
                borderColor: label.border_color,
              }}
            >
              <Tag size={14} className="shrink-0 opacity-75" />
              <span className="truncate font-heading text-xs font-bold">{label.label_text}</span>
            </button>

            {editable && selected ? (
              <button
                type="button"
                aria-label={`Cambiar tamaño de ${label.label_text}`}
                title="Arrastra para cambiar el tamaño"
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => startLabelResize(event, label)}
                className="absolute bottom-0 right-0 z-10 flex h-7 w-7 cursor-nwse-resize items-end justify-end rounded-tl-lg bg-brand p-1 text-white shadow-sm touch-none"
              >
                <MoveDiagonal2 size={13} />
              </button>
            ) : null}

            {editable && selected ? (
              <div
                className={`absolute left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-border bg-surface p-1 shadow-float ${
                  positionY < 0.38 ? "top-[calc(100%+0.35rem)]" : "bottom-[calc(100%+0.35rem)]"
                }`}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  aria-label={`Editar referencia ${label.label_text}`}
                  title={`Editar ${label.label_text}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onEditLabel?.(label);
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-brand-light hover:text-brand"
                >
                  <Pencil size={13} />
                </button>
                <button
                  type="button"
                  aria-label={`Borrar referencia ${label.label_text}`}
                  title={`Borrar ${label.label_text}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeleteLabel?.(label);
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-destructive transition-colors hover:bg-destructive/10"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ) : null}
          </div>
        );
      })}

      {zones.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center p-8 text-center">
          <div>
            <MapPin className="mx-auto mb-3 text-muted-foreground/50" size={28} />
            <p className="font-heading text-sm font-bold text-muted-foreground">
              No hay zonas configuradas
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
