import type { City } from "./cities";

const NUM_TILES = 1024;

const COLOR_PALETTE = [
  "#ff6b6b", // light red
  "#4ecdc4", // teal
  "#45b7d1", // sky blue
  "#96ceb4", // sage green
  "#feca57", // golden yellow
  "#ff9ff3", // pink
  "#54a0ff", // royal blue
  "#48dbfb", // cyan
  "#a29bfe", // lavender
  "#c8d6e5", // light gray blue
];

export type GridCity = City & {
  centerX: number;
  centerY: number;
  numTiles: number;
};

export type CityTiles = {
  index: number;
  cityName: string;
  tiles: Coordinate[];
  color: string;
};

export type Coordinate = {
  x: number;
  y: number;
};

type CandidateTile = {
  x: number;
  y: number;
  distanceToCenter: number;
};

/** Generates city tilesets from a list of cities and grid width + height */
export class PopMapGenerator {
  private static readonly BUFFER_SIZE = 5;
  private static readonly MAX_FALLBACK_CANDIDATES = 50;

  public cities: GridCity[];
  public totalPopulation: number;

  private numTiles: number;
  private cityTiles: CityTiles[];
  private takenCells: Set<number>;
  private gridWidth: number;
  private gridHeight: number;

  constructor(cities: City[], gridWidth: number, gridHeight: number) {
    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight;
    this.numTiles = NUM_TILES;
    this.cityTiles = [];
    this.totalPopulation = 0;
    this.takenCells = new Set();

    for (let city of cities) {
      this.totalPopulation += city.population;
    }

    // convert cities from lat/lng to PopMap grid coordinates
    // then sort cities by number of tiles, from lowest to highest
    this.cities = this.convertCitiesToGridCoordinates(cities);
    this.cities.sort((a, b) => a.numTiles - b.numTiles);
  }

  /** Generate city tiles */
  generate() {
    this.placeTiles();
    return this.cityTiles;
  }

  private convertCitiesToGridCoordinates(cities: City[]): GridCity[] {
    // Find min/max boundaries for longitude and latitude
    let minLng = Infinity;
    let maxLng = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;

    for (let city of cities) {
      minLng = Math.min(minLng, city.lng);
      maxLng = Math.max(maxLng, city.lng);
      minLat = Math.min(minLat, city.lat);
      maxLat = Math.max(maxLat, city.lat);
    }

    const rangeLng = maxLng - minLng;
    const rangeLat = maxLat - minLat;

    // buffer cells to avoid positioning cities on the edges of the map
    const effectiveWidth = this.gridWidth - 2 * PopMapGenerator.BUFFER_SIZE;
    const effectiveHeight = this.gridHeight - 2 * PopMapGenerator.BUFFER_SIZE;

    return cities.map((city) => ({
      ...city,
      centerX: Math.round(
        ((city.lng - minLng) / rangeLng) * effectiveWidth +
          PopMapGenerator.BUFFER_SIZE,
      ),
      centerY: Math.round(
        ((city.lat - minLat) / rangeLat) * effectiveHeight +
          PopMapGenerator.BUFFER_SIZE,
      ),
      numTiles: Math.round(
        this.numTiles * (city.population / this.totalPopulation),
      ),
    }));
  }

  /** Pack x,y coordinates for efficient hashing */
  private packCoordinate(x: number, y: number): number {
    return y * this.gridWidth + x;
  }

  /** Unpack x,y coordinates */
  private unpackCoordinate(packed: number): Coordinate {
    return {
      x: packed % this.gridWidth,
      y: Math.floor(packed / this.gridWidth),
    };
  }

  private placeTiles(): void {
    for (let cityIndex = 0; cityIndex < this.cities.length; cityIndex++) {
      const city = this.cities[cityIndex];
      const tiles: Coordinate[] = [];

      // Find the nearest open grid cell to the centroid
      const startCell = this.findNearestOpenCell(city.centerX, city.centerY);
      if (startCell) {
        this.takenCells.add(this.packCoordinate(startCell.x, startCell.y));
        tiles.push({ x: startCell.x, y: startCell.y });

        // Add remaining tiles
        for (let i = 1; i < city.numTiles; i++) {
          const nextCell = this.findBestNextCell(
            city.centerX,
            city.centerY,
            tiles,
          );
          if (nextCell) {
            this.takenCells.add(this.packCoordinate(nextCell.x, nextCell.y));
            tiles.push({ x: nextCell.x, y: nextCell.y });
          } else {
            break; // No more available cells
          }
        }
      }

      this.cityTiles.push({
        index: cityIndex,
        cityName: city.name,
        tiles,
        color: this.getColor(cityIndex),
      });
    }
  }

  private findNearestOpenCell(
    targetX: number,
    targetY: number,
  ): Coordinate | null {
    // return target cell if it is available
    if (this.isValidCell(targetX, targetY)) {
      if (!this.takenCells.has(this.packCoordinate(targetX, targetY))) {
        return { x: targetX, y: targetY };
      }
    }

    // spiral search for the nearest open cell to the target
    // inefficient but not an issue in flamegraphs for ~50 cities
    for (
      let radius = 1;
      radius < Math.max(this.gridWidth, this.gridHeight);
      radius++
    ) {
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          if (Math.abs(dx) === radius || Math.abs(dy) === radius) {
            const x = targetX + dx;
            const y = targetY + dy;
            if (this.isValidCell(x, y)) {
              if (!this.takenCells.has(this.packCoordinate(x, y))) {
                return { x, y };
              }
            }
          }
        }
      }
    }

    return null;
  }

  private isValidCell(x: number, y: number): boolean {
    return x >= 0 && x < this.gridWidth && y >= 0 && y < this.gridHeight;
  }

  private findBestNextCell(
    centerX: number,
    centerY: number,
    existingTiles: Coordinate[],
  ): Coordinate | null {
    const candidates: CandidateTile[] = [];
    const adjacentCells = new Set<number>();

    // Find cells adjacent to existing city tiles
    for (const tile of existingTiles) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (dx === 0 && dy === 0) continue;
          const x = tile.x + dx;
          const y = tile.y + dy;
          if (this.isValidCell(x, y)) {
            const packedCoord = this.packCoordinate(x, y);
            if (!this.takenCells.has(packedCoord)) {
              adjacentCells.add(packedCoord);
            }
          }
        }
      }
    }

    // Prioritize adjacent cells
    if (adjacentCells.size > 0) {
      for (const packedCoord of adjacentCells) {
        const { x, y } = this.unpackCoordinate(packedCoord);
        const distanceToCenter = Math.sqrt(
          Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2),
        );
        candidates.push({ x, y, distanceToCenter });
      }
    } else {
      // Fallback: spiral search
      let found = 0;
      const maxRadius = Math.max(this.gridWidth, this.gridHeight);

      for (
        let radius = 0;
        radius < maxRadius && found < PopMapGenerator.MAX_FALLBACK_CANDIDATES;
        radius++
      ) {
        for (let dx = -radius; dx <= radius; dx++) {
          for (let dy = -radius; dy <= radius; dy++) {
            // Only check cells at this radius
            if (Math.abs(dx) === radius || Math.abs(dy) === radius) {
              const x = Math.floor(centerX) + dx;
              const y = Math.floor(centerY) + dy;

              if (this.isValidCell(x, y)) {
                const packedCoord = this.packCoordinate(x, y);
                if (!this.takenCells.has(packedCoord)) {
                  const distanceToCenter = Math.sqrt(
                    Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2),
                  );
                  candidates.push({ x, y, distanceToCenter });
                  found++;

                  if (found >= PopMapGenerator.MAX_FALLBACK_CANDIDATES) {
                    break;
                  }
                }
              }
            }
          }
          if (found >= PopMapGenerator.MAX_FALLBACK_CANDIDATES) break;
        }
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    // Return the candidate with shortest distance to center
    let best = candidates[0];
    for (let i = 1; i < candidates.length; i++) {
      if (candidates[i].distanceToCenter < best.distanceToCenter) {
        best = candidates[i];
      }
    }
    return { x: best.x, y: best.y };
  }

  private getColor(index: number): string {
    return COLOR_PALETTE[index % COLOR_PALETTE.length];
  }
}
