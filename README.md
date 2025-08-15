# PopMap

Population map visualizer, extracted from Pop simulator.

## Getting started

```
npm install
npm run dev -- --open
```

## Map Generation

The core of this visualization is the map generator.
A map is fundamentally a grid of square cells, where each city is composed of tiles representing the city's relative population.
Each city has a name, lng/lat coordinates, and a population.
The generator:

- maps from lat/lng to grid coordinates
- maps from population count to the expected number of city tiles
- finds an empty cell to place the city center
- repeatedly adds tiles from empty adjacent cells. If there is no adjacent cell, it finds a cell that minimizes distance to the center tile via a spiral search.

Cities are placed in ascending population order, so larger cities like New York may appear to "swallow" smaller nearby cities.

## Rendering

Once the city grid is generated, we transform it into a render-friendly grid.
This second grid interleaves city tiles with border and corner rectangles:

- if two adjacent city tiles belong to the same city, place a same-city border tile between them
- if four adjacent city tiles make a square, place a same-city corner tile between them

The abstracted rendering grid lets us correctly render multi-tile cities with consistent border boundaries.

## Todo list

- [x] basic map rendering
- [x] zoom
- [x] add, remove, and edit cities
- [x] drag and drop to move cities
- [ ] filter city populations by demographics
- [ ] click on a city to see neighborhood populations and individual agents
