/**
 * Werte eines Builds aus den Modifikatoren der Quelle.
 *
 * Vereinfachte Rechnung wie in gängigen Tarkov-Werkzeugen: Ergonomie wird
 * addiert, Rückstoß-Modifikatoren von Teilen und Munition werden addiert und
 * auf den Grundrückstoß der Waffe angewendet. Skills, Haltbarkeit und
 * Spielmechaniken jenseits der Daten sind nicht enthalten – die Oberfläche sagt das.
 */
/** Was die Rechnung je Teil braucht (der Gunsmith-Bundle und der Server liefern es). */
export interface StatItem {
  ergonomics: number | null;
  recoilModifier: number | null;
  accuracyModifier: number | null;
  weight: number | null;
  price: number | null;
  /** Nur Magazine: erlaubte Munition. */
  allowedAmmo?: readonly string[];
}

export interface StatWeapon {
  ergonomics: number | null;
  recoilVertical: number | null;
  recoilHorizontal: number | null;
  allowedAmmo: readonly string[];
}

export interface StatAmmo {
  recoilModifier: number | null;
  accuracyModifier: number | null;
}

export interface StatNode {
  itemId: string;
  slots?: Readonly<Record<string, StatNode>>;
}

export interface BuildStats {
  ergonomics: number | null;
  /** Summe der Rückstoß-Modifikatoren (Teile + Munition) als Anteil. */
  recoilModifier: number;
  recoilVertical: number | null;
  recoilHorizontal: number | null;
  accuracyModifier: number;
  /** Gewicht der Waffe mit allen Teilen in kg. */
  weight: number;
  /** Summe der Teile (ohne Waffe) Ø 24 h in Rubel. */
  partsPrice: number;
  partsWithoutPrice: number;
  partCount: number;
}

const round = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits;

export function computeStats(root: StatNode, items: Readonly<Record<string, StatItem | undefined>>, weapon: StatWeapon, ammo: StatAmmo | null): BuildStats {
  let erg = 0;
  let rec = 0;
  let acc = 0;
  let weight = items[root.itemId]?.weight ?? 0;
  let price = 0;
  let missing = 0;
  let count = 0;
  const walk = (node: StatNode) => {
    for (const child of Object.values(node.slots ?? {})) {
      const it = items[child.itemId];
      count++;
      erg += it?.ergonomics ?? 0;
      rec += it?.recoilModifier ?? 0;
      acc += it?.accuracyModifier ?? 0;
      weight += it?.weight ?? 0;
      if (it?.price == null) missing++;
      else price += it.price;
      walk(child);
    }
  };
  walk(root);
  rec += ammo?.recoilModifier ?? 0;
  acc += ammo?.accuracyModifier ?? 0;
  const factor = 1 + rec;
  return {
    ergonomics: weapon.ergonomics === null ? null : round(weapon.ergonomics + erg, 1),
    recoilModifier: round(rec, 4),
    recoilVertical: weapon.recoilVertical === null ? null : Math.round(weapon.recoilVertical * factor),
    recoilHorizontal: weapon.recoilHorizontal === null ? null : Math.round(weapon.recoilHorizontal * factor),
    accuracyModifier: round(acc, 4),
    weight: round(weight, 3),
    partsPrice: Math.round(price),
    partsWithoutPrice: missing,
    partCount: count,
  };
}

/** Erlaubte Munition: Waffe ∩ eingesetztes Magazin (ohne Magazin nur die Waffe). */
export function allowedAmmoFor(root: StatNode, items: Readonly<Record<string, StatItem | undefined>>, weapon: StatWeapon): string[] {
  const mags: (readonly string[])[] = [];
  const walk = (node: StatNode) => {
    for (const child of Object.values(node.slots ?? {})) {
      const list = items[child.itemId]?.allowedAmmo;
      if (list) mags.push(list);
      walk(child);
    }
  };
  walk(root);
  if (mags.length === 0) return [...weapon.allowedAmmo];
  return weapon.allowedAmmo.filter((a) => mags.every((m) => m.includes(a)));
}
