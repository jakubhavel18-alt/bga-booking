// Patra budovy — appka má reálný půdorys (SVG export z CubiCasa) rozdělený
// na 3 samostatné soubory, jeden na patro. `value` se ukládá do sloupce
// `floor` u rooms/floorplan_labels (null = nezařazeno, mimo výběr patra).
export const FLOORS = [
  { value: -1, label: "Suterén", svg: "/floorplans/basement.svg", aspect: 194.36 / 175.44 },
  { value: 1, label: "1. patro", svg: "/floorplans/first-floor.svg", aspect: 194.36 / 199.36 },
  { value: 2, label: "2. patro", svg: "/floorplans/second-floor.svg", aspect: 194.36 / 199.36 },
] as const;

export type FloorValue = (typeof FLOORS)[number]["value"];

export function floorInfo(value: number | null) {
  return FLOORS.find((f) => f.value === value) ?? null;
}

export function floorLabel(value: number | null): string {
  return floorInfo(value)?.label ?? "Nezařazeno";
}
