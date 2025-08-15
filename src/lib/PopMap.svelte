<script lang="ts">
  import { onMount, onDestroy, tick } from "svelte";
  import * as d3 from "d3";
  import {
    PopMapGenerator,
    type CityTiles,
    type GridCity,
  } from "./PopMapGenerator";
  import type { City } from "$lib/cities";
  import CityTooltip from "./CityTooltip.svelte";

  export let cities: City[] = [];
  export let width: number = 600;
  export let height: number = 600;

  let editableCities: City[] = [];

  let svgElement: SVGSVGElement;
  let generator: PopMapGenerator;
  let generatorWidth: number;
  let generatorHeight: number;

  // Tooltip state
  let tooltipVisible = false;
  let tooltipX = 0;
  let tooltipY = 0;
  let tooltipCity: GridCity | null = null;

  // Drag state
  let isDragging = false;
  let dragCityIndex = -1;

  let zoom: d3.ZoomBehavior<SVGSVGElement, unknown> = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.3, 8])
    .on("zoom", (event) => {
      if (g) {
        g.attr("transform", event.transform.toString());
        // Mark that user has manually zoomed if this wasn't triggered programmatically
        if (event.sourceEvent) {
          hasUserZoomed = true;
        }
      }
    });

  let g: d3.Selection<SVGGElement, unknown, null, undefined>;
  let cityTiles: CityTiles[] = [];
  let hasUserZoomed = false; // Track if user has manually zoomed
  let resizeObserver: ResizeObserver;

  // Color palette for cities - same as HexMapGenerator
  const cityColors = [
    "#ff6b6b",
    "#4ecdc4",
    "#45b7d1",
    "#96ceb4",
    "#feca57",
    "#ff9ff3",
    "#54a0ff",
    "#48dbfb",
    "#feca57",
    "#c8d6e5",
  ];

  // Constants
  const GRID_SIZE = 10;
  const BORDER_SIZE = 2;
  const ZOOM_BORDER_PERCENT = 0.03;

  // Helper function for Y-coordinate flipping
  const flipY = (y: number, gridHeight: number) => gridHeight - 1 - y;

  function generateMap() {
    if (editableCities.length === 0) return;

    console.time("generateMap");

    // Use the dimensions for the generator's internal coordinate space
    generatorWidth = width;
    generatorHeight = height;

    // Convert pixel dimensions to grid dimensions
    const gridWidth = Math.floor(width / GRID_SIZE);
    const gridHeight = Math.floor(height / GRID_SIZE);

    console.time("generate");
    generator = new PopMapGenerator(editableCities, gridWidth, gridHeight);
    cityTiles = generator.generate();
    console.timeEnd("generate");

    console.time("render");
    renderMap();
    console.timeEnd("render");

    console.timeEnd("generateMap");
  }

  function initSvg() {
    const svg = d3.select(svgElement);

    // Clear any existing content first
    svg.selectAll("*").remove();

    // Attach zoom behavior to SVG
    svg.call(zoom);

    // Add global drag handlers to SVG
    svg
      .on("mousemove", onDrag)
      .on("mouseup", endDrag)
      .on("mouseleave", endDrag);

    // Create main group for zoom/pan
    g = svg.append("g");

    generateMap();
    setDefaultZoom();
  }

  function setDefaultZoom() {
    if (!svgElement) return;

    // Reset the user zoom flag since we're setting default
    hasUserZoomed = false;

    // Get the actual SVG element dimensions (not the props)
    const svgRect = svgElement.getBoundingClientRect();
    const actualWidth = svgRect.width;
    const actualHeight = svgRect.height;

    // Calculate the actual content bounds based on the city tile grid
    const cityGridWidth = Math.floor(generatorWidth / GRID_SIZE);
    const cityGridHeight = Math.floor(generatorHeight / GRID_SIZE);

    // The actual rendered content size should match the grid we're rendering
    const contentPixelWidth = cityGridWidth * GRID_SIZE;
    const contentPixelHeight = cityGridHeight * GRID_SIZE;

    // Calculate scale to fit content with border on each side
    const availableWidth = actualWidth * (1 - 2 * ZOOM_BORDER_PERCENT);
    const availableHeight = actualHeight * (1 - 2 * ZOOM_BORDER_PERCENT);

    const scaleX = availableWidth / contentPixelWidth;
    const scaleY = availableHeight / contentPixelHeight;
    const scale = Math.min(scaleX, scaleY);

    // Center the scaled content in the SVG
    const scaledContentWidth = contentPixelWidth * scale;
    const scaledContentHeight = contentPixelHeight * scale;
    const translateX = (actualWidth - scaledContentWidth) / 2;
    const translateY = (actualHeight - scaledContentHeight) / 2;

    // Apply scale and centering translation
    const transform = d3.zoomIdentity
      .translate(translateX, translateY)
      .scale(scale);
    d3.select(svgElement).call(zoom.transform, transform);
  }

  function renderMap() {
    if (!g) return;

    // Clear previous content
    g.selectAll("*").remove();

    // Create a render grid from the city tile grid
    // The rendering grid interleaves city tiles from PopMapGenerator with border/corner tiles
    // The abstracted grid lets us correctly render multi-square city shapes with consistent border boundaries:
    //
    // - if two adjacent city cells are same-city, the shared border cell also belongs to the city
    // - if a square of city cells are same-city, the shared corner cell also belongs to the city
    const backgroundColor = "rgba(8, 10, 20, 0.9)";
    const renderGridWidth = Math.floor(generatorWidth / GRID_SIZE) * 2 + 1;
    const renderGridHeight = Math.floor(generatorHeight / GRID_SIZE) * 2 + 1;

    // init render grid: null = unset, other values = city index
    const renderGrid: (number | null)[][] = Array(renderGridHeight)
      .fill(null)
      .map(() => Array(renderGridWidth).fill(null));

    // fill city tiles at odd render grid positions
    for (const cityData of cityTiles) {
      for (const tile of cityData.tiles) {
        const renderX = tile.x * 2 + 1;
        const renderY = tile.y * 2 + 1;
        renderGrid[renderY][renderX] = cityData.index;
      }
    }

    // fill border & corner tiles at even render grid positions
    // based on each city tile's top and left neighbors
    for (let y = 2; y < renderGridHeight - 2; y += 2) {
      for (let x = 2; x < renderGridWidth - 2; x += 2) {
        const upLeft = renderGrid[y - 1][x - 1];
        const downLeft = renderGrid[y + 1][x - 1];
        const upRight = renderGrid[y - 1][x + 1];
        const downRight = renderGrid[y + 1][x + 1];

        if (upLeft === null) {
          continue;
        }
        if (upLeft === upRight) {
          renderGrid[y - 1][x] = upLeft;
        }
        if (upLeft === downLeft) {
          renderGrid[y][x - 1] = upLeft;
        }
        if (
          upLeft === upRight &&
          upLeft === downLeft &&
          upLeft === downLeft &&
          upLeft === downRight
        ) {
          renderGrid[y][x] = upLeft;
        }
      }
    }

    // render the grid
    const renderGroup = g.append("g").attr("class", "render-grid");
    const cityTileSize = GRID_SIZE - BORDER_SIZE; // City tile pixel size

    // Calculate cumulative positions for variable-sized grid
    // Pattern: border(2px), city(8px), border(2px), city(8px), ...
    const xPositions: number[] = new Array(renderGridWidth);
    const yPositions: number[] = new Array(renderGridHeight);

    for (let x = 0; x < renderGridWidth - 1; x += 2) {
      const basePos = GRID_SIZE * (x / 2);
      xPositions[x] = basePos;
      xPositions[x + 1] = basePos + BORDER_SIZE;
    }

    for (let y = 0; y < renderGridHeight - 1; y += 2) {
      const basePos = GRID_SIZE * (y / 2);
      yPositions[y] = basePos;
      yPositions[y + 1] = basePos + BORDER_SIZE;
    }

    // Final border col/row
    xPositions[renderGridWidth - 1] = GRID_SIZE * ((renderGridWidth - 1) / 2);
    yPositions[renderGridHeight - 1] = GRID_SIZE * ((renderGridHeight - 1) / 2);

    for (let y = 0; y < renderGridHeight; y++) {
      for (let x = 0; x < renderGridWidth; x++) {
        const cellValue = renderGrid[y][x];
        const screenX = xPositions[x];
        const flippedY = flipY(y, renderGridHeight);
        const screenY = yPositions[flippedY];

        // Determine cell size based on position
        const cellWidth = x % 2 === 1 ? cityTileSize : BORDER_SIZE;
        const cellHeight = flippedY % 2 === 1 ? cityTileSize : BORDER_SIZE;

        // Only render tiles that have city data (skip background tiles)
        if (cellValue !== null && cellValue >= 0) {
          const cityData = cityTiles.find((c) => c.index === cellValue);
          const fillColor = cityData ? cityData.color : backgroundColor;

          const rect = renderGroup
            .append("rect")
            .attr("x", screenX)
            .attr("y", screenY)
            .attr("width", cellWidth)
            .attr("height", cellHeight)
            .attr("fill", fillColor);

          // Add hover events for city tiles
          const city = generator.cities[cellValue];
          if (city) {
            rect
              .attr("class", `city-tile city-${cellValue}`)
              .style(
                "cursor",
                isDragging && dragCityIndex === cellValue ? "grabbing" : "grab",
              )
              .on("mouseenter", (event) => {
                if (!isDragging) {
                  // Highlight all tiles of this city
                  renderGroup
                    .selectAll(`.city-${cellValue}`)
                    .classed("hovered", true);
                  showTooltip(event, city);
                }
              })
              .on("mousemove", moveTooltip)
              .on("mouseleave", () => {
                if (!isDragging) {
                  // Remove highlight from all tiles of this city
                  renderGroup
                    .selectAll(`.city-${cellValue}`)
                    .classed("hovered", false);
                  hideTooltip();
                }
              })
              .on("mousedown", (event) => {
                // Find the actual index in editableCities by matching city name
                const cityIndex = editableCities.findIndex(
                  (c) => c.name === city.name,
                );
                startDrag(event, cityIndex);
              });
          }
        }
      }
    }
  }

  function showTooltip(event: MouseEvent, city: GridCity) {
    if (!generator) return;

    tooltipCity = city;
    tooltipX = event.pageX;
    tooltipY = event.pageY;
    tooltipVisible = true;
  }

  function moveTooltip(event: MouseEvent) {
    tooltipX = event.pageX;
    tooltipY = event.pageY;
  }

  function hideTooltip() {
    tooltipVisible = false;
  }

  function startDrag(event: MouseEvent, cityIndex: number) {
    event.stopPropagation();
    isDragging = true;
    dragCityIndex = cityIndex;
    hideTooltip();

    // Debug log the city being dragged
    const city = editableCities[cityIndex];
    if (city) {
      console.log("Started dragging city:", city.name);
    }

    // Disable zoom during drag
    d3.select(svgElement).on(".zoom", null);
  }

  function onDrag(event: MouseEvent) {
    if (!isDragging || dragCityIndex === -1 || !generator) return;

    // Get mouse position in SVG coordinates
    const svgRect = svgElement.getBoundingClientRect();
    const svgX = event.clientX - svgRect.left;
    const svgY = event.clientY - svgRect.top;

    // Transform to grid coordinates accounting for current zoom/pan
    const transform = d3.zoomTransform(svgElement);
    const gridX = (svgX - transform.x) / transform.k;
    const gridY = (svgY - transform.y) / transform.k;

    // Convert to city grid coordinates
    const cityGridX = Math.round(gridX / GRID_SIZE);
    const cityGridY = Math.round(
      flipY(gridY / GRID_SIZE, Math.floor(generatorHeight / GRID_SIZE)),
    );

    // Get the city to update
    const city = editableCities[dragCityIndex];
    if (city && generator) {
      // Get current coordinate bounds from all cities
      let minLng = Infinity,
        maxLng = -Infinity,
        minLat = Infinity,
        maxLat = -Infinity;
      for (let c of editableCities) {
        minLng = Math.min(minLng, c.lng);
        maxLng = Math.max(maxLng, c.lng);
        minLat = Math.min(minLat, c.lat);
        maxLat = Math.max(maxLat, c.lat);
      }

      // Calculate grid bounds
      const gridWidth = Math.floor(generatorWidth / GRID_SIZE);
      const gridHeight = Math.floor(generatorHeight / GRID_SIZE);
      const effectiveWidth = gridWidth - 2 * 5; // BUFFER_SIZE = 5
      const effectiveHeight = gridHeight - 2 * 5;

      // Convert grid position to lat/lng
      const rangeLng = maxLng - minLng;
      const rangeLat = maxLat - minLat;

      // Stay within grid bounds
      const clampedGridX = Math.max(5, Math.min(gridWidth - 5, cityGridX));
      const clampedGridY = Math.max(5, Math.min(gridHeight - 5, cityGridY));

      const newLng = minLng + ((clampedGridX - 5) / effectiveWidth) * rangeLng;
      const newLat = minLat + ((clampedGridY - 5) / effectiveHeight) * rangeLat;

      // Update city lat/lng coordinates
      const updatedCity = { ...city, lat: newLat, lng: newLng };
      editableCities[dragCityIndex] = updatedCity;
      editableCities = editableCities; // Trigger reactivity

      // Regenerate the map with new coordinates
      generateMap();
    }
  }

  function endDrag() {
    if (isDragging) {
      isDragging = false;
      dragCityIndex = -1;

      // Re-enable zoom
      d3.select(svgElement).call(zoom);
    }
  }

  function zoomIn() {
    hasUserZoomed = true;
    d3.select(svgElement).transition().duration(300).call(zoom.scaleBy, 1.5);
  }

  function zoomOut() {
    hasUserZoomed = true;
    d3.select(svgElement)
      .transition()
      .duration(300)
      .call(zoom.scaleBy, 1 / 1.5);
  }

  function resetView() {
    if (!svgElement) return;

    // Reset the user zoom flag since we're resetting to default
    hasUserZoomed = false;

    // Use the same calculation as setDefaultZoom but with transition
    const svgRect = svgElement.getBoundingClientRect();
    const actualWidth = svgRect.width;
    const actualHeight = svgRect.height;

    const cityGridWidth = Math.floor(generatorWidth / GRID_SIZE);
    const cityGridHeight = Math.floor(generatorHeight / GRID_SIZE);
    const contentPixelWidth = cityGridWidth * GRID_SIZE;
    const contentPixelHeight = cityGridHeight * GRID_SIZE;

    const availableWidth = actualWidth * (1 - 2 * ZOOM_BORDER_PERCENT);
    const availableHeight = actualHeight * (1 - 2 * ZOOM_BORDER_PERCENT);
    const scaleX = availableWidth / contentPixelWidth;
    const scaleY = availableHeight / contentPixelHeight;
    const scale = Math.min(scaleX, scaleY);

    // Center the scaled content
    const scaledContentWidth = contentPixelWidth * scale;
    const scaledContentHeight = contentPixelHeight * scale;
    const translateX = (actualWidth - scaledContentWidth) / 2;
    const translateY = (actualHeight - scaledContentHeight) / 2;

    // Apply scale and centering translation with transition
    const transform = d3.zoomIdentity
      .translate(translateX, translateY)
      .scale(scale);
    d3.select(svgElement)
      .transition()
      .duration(500)
      .call(zoom.transform, transform);
  }

  function updatePopulation(index: number, newPopulation: string) {
    const population = parseInt(newPopulation) || 0;
    editableCities[index] = { ...editableCities[index], population };
    editableCities = editableCities; // Trigger reactivity
    generateMap();
  }

  function addCity() {
    const newCity: City = {
      name: "New City",
      state: "ST",
      lat: 39.0,
      lng: -95.0,
      population: 100000,
    };
    editableCities = [newCity, ...editableCities];
    generateMap();
  }

  function removeCity(index: number) {
    editableCities = editableCities.filter((_, i) => i !== index);
    generateMap();
  }

  onMount(async () => {
    // Initialize cities on mount
    if (cities.length > 0) {
      console.log(
        "Initializing editableCities in onMount with",
        cities.length,
        "cities",
      );
      editableCities = cities.map((city) => ({ ...city }));
      console.log(
        "editableCities initialized with",
        editableCities.length,
        "cities",
      );

      // Initialize SVG after cities are set
      await tick();
      initSvg();

      // Set up resize observer immediately after SVG initialization
      if (svgElement) {
        resizeObserver = new ResizeObserver(() => {
          // Only recalculate if user hasn't manually zoomed
          if (!hasUserZoomed && svgElement) {
            setDefaultZoom();
          }
        });

        resizeObserver.observe(svgElement);
      }
    }
  });

  onDestroy(() => {
    if (resizeObserver && svgElement) {
      resizeObserver.unobserve(svgElement);
      resizeObserver.disconnect();
    }
  });
</script>

<div class="pop-map-container">
  <div class="map-section">
    <svg bind:this={svgElement} {width} {height} class="map-svg" />

    <div class="controls">
      <button on:click={zoomIn}>Zoom In</button>
      <button on:click={zoomOut}>Zoom Out</button>
      <button on:click={resetView}>Reset View</button>
      <div class="info">
        Cities: {editableCities.length} | Total Population: {editableCities
          .reduce((sum, c) => sum + c.population, 0)
          .toLocaleString()}
      </div>
    </div>
  </div>

  <div class="cities-section">
    <div class="cities-header">
      <h3>Cities & Populations</h3>
      <button on:click={addCity} class="add-button">+ Add City</button>
    </div>

    <div class="cities-table">
      <div class="table-header">
        <div class="col-name">City</div>
        <div class="col-population">Population</div>
        <div class="col-actions">Delete</div>
      </div>

      <div class="table-body">
        {#each editableCities as city, index}
          <div class="table-row">
            <div class="col-name">
              <input
                bind:value={city.name}
                on:input={() => {
                  editableCities = editableCities;
                  generateMap();
                }}
                class="city-input"
              />
            </div>
            <div class="col-population">
              <input
                type="number"
                value={city.population}
                on:input={(e) =>
                  updatePopulation(index, (e.target as HTMLInputElement).value)}
                class="population-input"
              />
            </div>
            <div class="col-actions">
              <button on:click={() => removeCity(index)} class="remove-button"
                >✕</button
              >
            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>
</div>

{#if tooltipCity}
  <CityTooltip
    visible={tooltipVisible}
    x={tooltipX}
    y={tooltipY}
    city={tooltipCity}
  />
{/if}

<style>
  :global(body) {
    background: linear-gradient(135deg, #0f0f1e 0%, #1a1a2e 100%);
    color: white;
    min-height: 100vh;
    font-family: monospace;
    margin: 0;
    padding: 0;
  }

  button,
  input {
    font-family: monospace;
  }

  .pop-map-container {
    display: flex;
    gap: 2rem;
    padding: 1.5rem;
    border-radius: 5px;
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    max-width: 100%;
    overflow: hidden;
  }

  .map-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    min-width: 0;
  }

  .cities-section {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 5px;
    padding: 1rem;
  }

  .cities-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .cities-header h3 {
    margin: 0;
    color: #ddd;
    font-size: 18px;
  }

  .add-button {
    background: rgba(76, 175, 80, 0.2);
    border: 1px solid rgba(76, 175, 80, 0.4);
    color: white;
    padding: 8px 16px;
    border-radius: 5px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    transition: all 0.3s ease;
  }

  .add-button:hover {
    background: rgba(76, 175, 80, 0.3);
  }

  .cities-table {
    background: rgba(255, 255, 255, 0.03);
    border-radius: 5px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .table-header,
  .table-row {
    display: flex;
    gap: 0.5rem;
    padding: 0.75rem;
    align-items: center;
  }

  .col-name {
    flex: 1;
    min-width: 150px;
    text-align: left;
  }

  .col-population {
    flex: 0 0 100px;
    text-align: center;
  }

  .col-actions {
    flex: 0 0 40px;
    text-align: center;
  }

  .table-header {
    background: rgba(100, 181, 246, 0.15);
    font-weight: 600;
    font-size: 12px;
    color: #64b5f6;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .table-row {
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .table-row:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .city-input,
  .population-input {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 3px;
    padding: 6px 8px;
    color: white;
    font-size: 13px;
    transition: all 0.2s ease;
    box-sizing: border-box;
    width: 100%;
  }

  .city-input:focus,
  .population-input:focus {
    outline: none;
    border-color: #64b5f6;
    background: rgba(100, 181, 246, 0.1);
    transform: scale(1.05);
  }

  .population-input {
    text-align: right;
  }

  .population-input::-webkit-outer-spin-button,
  .population-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .population-input[type="number"] {
    -moz-appearance: textfield;
    appearance: textfield;
  }

  .remove-button {
    background: rgba(244, 67, 54, 0.2);
    border: 1px solid rgba(244, 67, 54, 0.4);
    color: white;
    padding: 6px 12px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 14px;
    height: 100%;
    width: 100%;
  }

  .remove-button:hover {
    background: rgba(244, 67, 54, 0.3);
    transform: scale(1.05);
  }

  .table-body {
    max-height: 440px;
    overflow-y: auto;
    scrollbar-width: thin; /* Firefox */
    scrollbar-color: rgba(255, 255, 255, 0.2) transparent; /* Firefox */
  }

  .table-body::-webkit-scrollbar {
    width: 8px;
  }

  .table-body::-webkit-scrollbar-track {
    background: transparent;
  }

  .table-body::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 2px;
  }

  .table-body::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.3);
  }

  .map-svg {
    border-radius: 5px;
    cursor: move;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    background: rgba(8, 10, 20, 0.9);
    max-width: 100%;
    height: auto;
    shape-rendering: crispEdges;
  }

  :global(.city-tile) {
    cursor: pointer;
    shape-rendering: crispEdges;
  }

  :global(.render-grid rect) {
    shape-rendering: crispEdges;
  }

  :global(.city-tile.hovered) {
    filter: brightness(1.3) saturate(1.2);
    shape-rendering: crispEdges;
  }

  .controls {
    display: flex;
    gap: 1.5rem;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
  }

  button {
    background: rgba(100, 181, 246, 0.2);
    border: 1px solid rgba(100, 181, 246, 0.4);
    color: white;
    padding: 12px 24px;
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.3s ease;
    font-weight: 500;
    backdrop-filter: blur(10px);
    font-size: 14px;
  }

  button:hover {
    background: linear-gradient(
      145deg,
      rgba(100, 181, 246, 0.3),
      rgba(66, 165, 245, 0.4)
    );
    transform: scale(1.05);
  }

  .info {
    font-size: 14px;
    color: #ddd;
    padding: 12px 24px;
    border-radius: 5px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(10px);
  }

  /* Responsive design for mobile devices */
  @media (max-width: 768px) and (orientation: portrait) {
    .pop-map-container {
      flex-direction: column;
      gap: 1.5rem;
      padding: 1rem;
    }

    .cities-section {
      flex: 1 1 auto;
      max-width: 100%;
    }

    .map-section {
      width: 100%;
    }

    .controls {
      gap: 0.75rem;
    }

    button {
      padding: 10px 16px;
      font-size: 12px;
    }

    .info {
      font-size: 12px;
      padding: 8px 12px;
    }

    .table-body {
      max-height: 300px;
    }
  }

  /* Extra small devices */
  @media (max-width: 480px) {
    .pop-map-container {
      padding: 0.5rem;
      gap: 1rem;
    }

    .controls {
      flex-direction: column;
      gap: 0.75rem;
    }

    .controls button {
      width: 100%;
      box-sizing: border-box;
      padding: 10px 16px;
      font-size: 12px;
    }

    .info {
      width: 100%;
      text-align: center;
      box-sizing: border-box;
      padding: 8px 12px;
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .cities-section {
      padding: 0.75rem;
    }

    .table-header,
    .table-row {
      padding: 0.5rem;
      font-size: 12px;
    }

    .col-name {
      min-width: 80px;
    }

    .city-input,
    .population-input {
      font-size: 12px;
      padding: 4px 6px;
    }
  }

  /* Landscape orientation on mobile */
  @media (max-width: 768px) and (orientation: landscape) {
    .pop-map-container {
      flex-direction: row;
    }

    .table-body {
      max-height: 250px;
    }
  }

  /* Tablets in portrait */
  @media (min-width: 769px) and (max-width: 1024px) and (orientation: portrait) {
    .pop-map-container {
      flex-direction: column;
    }

    .cities-section {
      flex: 1 1 auto;
      max-width: 100%;
    }
  }
</style>
