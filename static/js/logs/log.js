/**
 * Log
 *
 * Draws a single log
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

'use strict';

const App = require('../app');
const Icons = require('../icons');
const Utils = require('../utils');

const LEFT_MOUSE_BUTTON = 1;
const RIGHT_MOUSE_BUTTON = 2;

// Scrolling using the scroll control bar
const SCROLLING = 1;
// Dragging a window on the graph itself
const DRAGGING = 2;

class Log {
  constructor(thingId, propertyId, logStart, logEnd, soloView) {
    this.thingId = thingId;
    this.propertyId = propertyId;
    this.logStart = logStart;
    this.logEnd = logEnd;
    this.start = new Date(this.logEnd.getTime() - 24 * 60 * 60 * 1000);
    this.end = this.logEnd;
    this.soloView = soloView;

    this.dimension();
    this.elt = document.createElement('div');
    this.elt.classList.add('logs-log-container');
    if (this.soloView) {
      this.elt.classList.add('logs-log-container-solo-view');
    }
    this.rawPoints = [];

    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onPointerLeave = this.onPointerLeave.bind(this);
    this.scrollLeft = this.scrollLeft.bind(this);
    this.scrollRight = this.scrollRight.bind(this);
    this.pointerState = {};
    this.prevPointerState = {};
    this.touchTooltipTimeout = null;

    this.restoreWindow();
    this.drawSkeleton();
  }

  dimension() {
    this.xMargin = 96;
    this.xStart = this.xMargin + 20;
    if (window.innerWidth < 800) {
      this.xMargin = 72;
      this.xStart = 48;
    }
    this.width = window.innerWidth;

    if (this.soloView) {
      this.yMargin = 30;
      this.scrollHeight = 30;
      this.yPadding = 30;
      this.height = window.innerHeight - 96 - this.yMargin * 2 -
        this.scrollHeight - this.yPadding;
    } else {
      this.yMargin = 20;
      this.height = 200;
      this.scrollHeight = 30;
      this.yPadding = 20;
    }
    this.graphHeight = this.height - 2 * this.yMargin;
    this.graphWidth = this.width - this.xStart - this.xMargin;
  }

  drawSkeleton() {
    this.removeAll('.logs-log-info');
    this.removeAll('.logs-graph');
    this.removeAll('.logs-graph-tooltip');

    if (!this.soloView) {
      // Get in the name and webcomponent
      if (!this.name) {
        this.name = document.createElement('div');
        this.name.classList.add('logs-log-name');
      }
      if (!this.icon) {
        this.icon = document.createElement('div');
        this.icon.classList.add('logs-log-icon');
      }
      this.infoContainer = document.createElement('a');
      this.infoContainer.classList.add('logs-log-info');
      this.infoContainer.appendChild(this.icon);
      this.infoContainer.appendChild(this.name);
      this.elt.appendChild(this.infoContainer);
    }

    this.createWeekDropdown();

    this.graph = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.graph.classList.add('logs-graph');
    this.graph.style.width = `${this.width}px`;
    this.graph.style.height = `${this.height + this.scrollHeight + this.yPadding}px`;
    this.graph.addEventListener('mousedown', this.onPointerDown);
    this.graph.addEventListener('mousemove', this.onPointerMove);
    this.graph.addEventListener('mouseup', this.onPointerUp);
    this.graph.addEventListener('mouseleave', this.onPointerLeave);
    this.graph.addEventListener('touchstart', this.onPointerDown);
    this.graph.addEventListener('touchmove', this.onPointerMove);
    this.graph.addEventListener('touchend', this.onPointerUp);
    this.graph.addEventListener('contextmenu', (e) => e.preventDefault());

    const axesPath = this.makePath([
      {x: this.xStart, y: this.yMargin},
      {x: this.xStart, y: this.height - this.yMargin},
      {x: this.width - this.xMargin, y: this.height - this.yMargin},
    ]);
    axesPath.classList.add('logs-graph-axes');
    this.graph.appendChild(axesPath);

    this.yAxisLabel = this.makeText('', this.xStart - 5,
                                    this.height / 2, 'end', 'middle');
    this.yAxisLabel.classList.add('logs-graph-label');
    this.graph.appendChild(this.yAxisLabel);

    this.progress = document.createElementNS('http://www.w3.org/2000/svg',
                                             'rect');
    this.progress.classList.add('logs-graph-progress');
    this.progress.setAttribute('x', this.xStart);
    this.progress.setAttribute('y', this.yMargin);
    this.progressWidth = Math.floor(0.05 * this.graphWidth);
    this.progress.setAttribute('width', this.progressWidth);
    this.progress.setAttribute('height', this.graphHeight);

    this.graph.appendChild(this.progress);

    this.selectionHighlight =
      document.createElementNS('http://www.w3.org/2000/svg',
                               'rect');
    this.selectionHighlight.classList.add('logs-graph-selection-highlight');
    this.selectionHighlight.setAttribute('x', this.xStart);
    this.selectionHighlight.setAttribute('y', this.yMargin);
    this.selectionHighlight.setAttribute('width', 0);
    this.selectionHighlight.setAttribute('height', this.graphHeight);

    this.graph.appendChild(this.selectionHighlight);

    this.drawScrollBar();

    this.elt.appendChild(this.graph);

    this.tooltip = document.createElement('div');
    this.tooltip.classList.add('logs-graph-tooltip');
    this.tooltipValue = document.createElement('p');
    this.tooltipDate = document.createElement('p');
    this.tooltip.appendChild(this.tooltipValue);
    this.tooltip.appendChild(this.tooltipDate);
    this.elt.appendChild(this.tooltip);
  }

  createWeekDropdown() {
    if (this.weekDropdown) {
      return;
    }
    this.weekDropdown = document.createElement('select');
    this.weekDropdown.classList.add('logs-log-week-dropdown', 'arrow-select');
    const oneHourMs = 60 * 60 * 1000;
    const oneDayMs = 24 * oneHourMs;
    const oneWeekMs = 7 * oneDayMs;
    const options = [
      {name: 'Hour', value: oneHourMs},
      {name: 'Day', value: oneDayMs},
      {name: 'Week', value: oneWeekMs},
    ];
    const currentValue = this.end.getTime() - this.start.getTime();
    let anySelected = false;
    for (const opt of options) {
      const option = document.createElement('option');
      option.textContent = opt.name;
      option.value = opt.value;
      if (opt.value === currentValue) {
        option.setAttribute('selected', true);
        anySelected = true;
      }
      this.weekDropdown.appendChild(option);
    }
    if (!anySelected) {
      const dayOption = this.weekDropdown.childNodes[1];
      dayOption.setAttribute('selected', true);
    }
    const onChange = () => {
      let newEnd = this.end.getTime();
      let newStart = newEnd - this.weekDropdown.value;
      if (newStart < this.logStart.getTime()) {
        newStart = this.logStart.getTime();
        newEnd = newStart + this.weekDropdown.value;
      }
      this.start = new Date(newStart);
      this.end = new Date(newEnd);
      this.redraw();
      this.storeWindow();
    };
    this.weekDropdown.addEventListener('change', onChange);
    this.elt.appendChild(this.weekDropdown);
  }

  makePath(points, close) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const text = [
      'M', Math.round(points[0].x).toString(),
      Math.round(points[0].y).toString(),
    ];
    for (let i = 1; i < points.length; i++) {
      text.push('L', Math.round(points[i].x).toString(),
                Math.round(points[i].y).toString());
    }
    if (close) {
      text.push('Z');
    }
    path.setAttribute('d', text.join(' '));
    return path;
  }

  makeText(text, x, y, anchor, baseline) {
    const elt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    elt.textContent = text;
    elt.setAttribute('text-anchor', anchor);
    elt.setAttribute('dominant-baseline', baseline);
    elt.setAttribute('x', x);
    elt.setAttribute('y', y);
    return elt;
  }

  async load() {
    const thing = await App.gatewayModel.getThing(this.thingId);
    const thingModel = await App.gatewayModel.getThingModel(this.thingId);
    if (!thing || !thingModel) {
      // be sad
      return;
    }
    const thingName = thing.name;
    this.property = thingModel.propertyDescriptions[this.propertyId];
    const propertyName = this.property.title ||
      Utils.capitalize(this.propertyId);
    const formattedName = `${thingName} ${propertyName}`;
    if (this.soloView) {
      document.querySelector('.logs-header').textContent = formattedName;
    } else {
      this.name.textContent = formattedName;
    }

    if (!this.soloView) {
      let iconUrl = '';
      if (thing.selectedCapability) {
        iconUrl = Icons.capabilityToIcon(thing.selectedCapability);
      } else {
        iconUrl = Icons.typeToIcon(thing.type);
      }
      this.icon.style.backgroundImage = `url(${iconUrl})`;
      const detailUrl = `/logs/things/${this.thingId}/properties/${this.propertyId}`;
      this.infoContainer.setAttribute('href', detailUrl);
    }

    const propertyUnit = this.property.unit || '';
    this.yAxisLabel.textContent = Utils.unitNameToAbbreviation(propertyUnit);

    if (this.rawPoints.length > 0) {
      this.redraw();
    }
  }

  clearPoints() {
    this.rawPoints = [];
  }

  addRawPoint(point) {
    this.rawPoints.push({
      value: point.value,
      time: point.date,
    });

    // update progress bar
    if (this.rawPoints.length > 2) {
      const lastPoint = this.rawPoints[this.rawPoints.length - 1];
      let fractionDone = (lastPoint.time - this.start.getTime()) /
        (this.end.getTime() - this.start.getTime());
      fractionDone = Math.min(fractionDone, 1);
      const width = Math.floor((fractionDone * 0.95 + 0.05) * this.graphWidth);
      if (width > this.progressWidth) {
        this.progress.setAttribute('width', width);
        this.progressWidth = width;
      }
    }
  }

  valueBounds() {
    if (this.property.unit === 'percent') {
      return {
        min: 0,
        max: 100,
      };
    }
    if (this.property.type === 'boolean') {
      return {
        min: 0,
        max: 1,
      };
    }

    if (this.rawPoints.length === 0) {
      if (this.property.hasOwnProperty('minimum') &&
          this.property.hasOwnProperty('maximum')) {
        return {
          min: this.property.minimum,
          max: this.property.maximum,
        };
      } else {
        return {
          min: 0,
          max: 1,
        };
      }
    }

    let min = this.rawPoints[0].value;
    let max = min;
    for (let i = 1; i < this.rawPoints.length; i++) {
      const value = this.rawPoints[i].value;
      if (max < value) {
        max = value;
      }
      if (min > value) {
        min = value;
      }
    }

    if (this.property.hasOwnProperty('minimum') &&
        this.property.hasOwnProperty('maximum')) {
      const propMin = this.property.minimum;
      const propMax = this.property.maximum;
      // If the description's min and max aren't ridiculously out of proportion
      // use them since they likely have good properties
      if ((propMax - propMin) / (max - min + 0.001) < 3 &&
          min >= propMin &&
          max <= propMax) {
        return {
          min: propMin,
          max: propMax,
        };
      }
    }

    let margin = 0.1 * (max - min);
    if (this.rawPoints.length === 1 || min === max) {
      margin = 1;
    }
    // If there are no values less than zero make the lower bound zero for
    // aesthetic reasons (e.g. power consumption)
    if (min >= 0 && min - margin < 0) {
      min = margin;
    }
    return {
      min: min - margin,
      max: max + margin,
    };
  }

  timeToX(time, customStartTime, customEndTime) {
    const startTime = customStartTime || this.start.getTime();
    const endTime = customEndTime || this.end.getTime();
    return (time - startTime) / (endTime - startTime) * this.graphWidth +
      this.xStart;
  }

  xToTime(x, customStartTime, customEndTime) {
    const startTime = customStartTime || this.start.getTime();
    const endTime = customEndTime || this.end.getTime();
    return (x - this.xStart) / this.graphWidth * (endTime - startTime) +
      startTime;
  }

  valueToY(value) {
    return this.height - this.yMargin -
      (value - this.valueMin) /
      (this.valueMax - this.valueMin) * this.graphHeight;
  }

  interpolate(pointA, pointB, x) {
    if (pointB.x - pointA.x === 0) {
      return {
        x,
        y: pointA.y,
      };
    }
    const m = (pointB.y - pointA.y) / (pointB.x - pointA.x);
    return {
      x,
      y: m * (x - pointA.x) + pointA.y,
    };
  }

  determineBounds() {
    if (this.hasOwnProperty('valueMin')) {
      return;
    }
    const bounds = this.valueBounds();
    this.valueMin = Math.min(0, bounds.min);
    this.valueMax = bounds.max;
    // Preserve 3 significant figures (not using toPrecision since that does
    // scientific notation)
    const lowestPowerOf10ToPreserve = Math.pow(
      10,
      Math.ceil(Math.log(this.valueMax - this.valueMin) / Math.LN10) - 3);
    this.valueMax = Math.ceil(this.valueMax / lowestPowerOf10ToPreserve) *
      lowestPowerOf10ToPreserve;
    this.valueMin = Math.floor(this.valueMin / lowestPowerOf10ToPreserve) *
      lowestPowerOf10ToPreserve;
  }

  redraw() {
    if (!this.property) {
      return;
    }

    this.removeAll('.logs-graph-line');
    this.removeAll('.logs-graph-fill');
    this.removeAll('.logs-graph-label');
    this.removeAll('.logs-graph-tick');
    this.removeTooltip();

    this.progress.setAttribute('width', 0);
    this.progressWidth = 0;

    this.determineBounds();

    this.drawYTicks();
    this.drawXTicks();

    this.updateScrollBar();

    if (this.rawPoints.length === 0) {
      return;
    }

    const points = [];
    let startIndex = this.nearestIndex(this.start.getTime()) - 1;
    startIndex = Math.max(0, startIndex);
    let leftIndex = Math.max(0, startIndex - 1);

    let endIndex = this.nearestIndex(this.end.getTime()) + 1;
    endIndex = Math.min(endIndex, this.rawPoints.length - 1);
    let rightIndex = Math.min(endIndex + 1, this.rawPoints.length - 1);

    for (let i = startIndex; i <= endIndex; i++) {
      const raw = this.rawPoints[i];
      if (raw.time < this.start.getTime()) {
        leftIndex = i;
        continue;
      }
      if (raw.time > this.end.getTime()) {
        if (i < rightIndex) {
          rightIndex = i;
        }
        continue;
      }

      const x = this.timeToX(raw.time);
      const y = this.valueToY(raw.value);

      if (points.length > 0) {
        // Add a point so that the value steps down instead of gradually
        // decreasing
        if (this.property.type === 'boolean' ||
            this.property.type === 'integer') {
          points.push({
            x,
            y: points[points.length - 1].y,
          });
        }
      }

      points.push({x, y});
    }

    // Extend to left
    const leftPoint = {
      x: this.timeToX(this.rawPoints[leftIndex].time),
      y: this.valueToY(this.rawPoints[leftIndex].value),
    };

    if (this.property.type === 'boolean' ||
        this.property.type === 'integer') {
      // Add a point so that the value steps down instead of gradually
      // decreasing
      points.unshift({
        x: this.xStart,
        y: leftPoint.y,
      }, {
        x: points.length > 0 ? points[0].x : this.xStart + this.graphWidth,
        y: leftPoint.y,
      });
    } else if (points.length > 0) {
      const borderPoint = this.interpolate(leftPoint, points[0],
                                           this.xStart);
      points.unshift(borderPoint);
    }

    // Extend to right

    const rightPoint = {
      x: this.timeToX(this.rawPoints[rightIndex].time),
      y: this.valueToY(this.rawPoints[rightIndex].value),
    };

    if (this.property.type === 'boolean' ||
        this.property.type === 'integer') {
      // Add a point so that the value steps down instead of gradually
      // decreasing
      points.push({
        x: points[points.length - 1].x,
        y: rightPoint.y,
      }, {
        x: this.xStart + this.graphWidth,
        y: rightPoint.y,
      });
    } else if (points.length > 0) {
      const borderPoint = this.interpolate(points[points.length - 1],
                                           rightPoint,
                                           this.xStart + this.graphWidth);
      points.push(borderPoint);
    } else {
      const borderLeftPoint = this.interpolate(leftPoint,
                                               rightPoint,
                                               this.xStart);
      const borderRightPoint = this.interpolate(leftPoint,
                                                rightPoint,
                                                this.xStart + this.graphWidth);
      points.push(borderLeftPoint, borderRightPoint);
    }

    const graphLine = this.makePath(points);
    graphLine.classList.add('logs-graph-line');

    points.unshift({
      x: points[0].x,
      y: this.height - this.yMargin,
    });
    points.push({
      x: points[points.length - 1].x,
      y: this.height - this.yMargin,
    });

    const graphFill = this.makePath(points);
    graphFill.classList.add('logs-graph-fill');

    this.graph.appendChild(graphFill);
    this.graph.appendChild(graphLine);
  }

  timeToLabel(time) {
    const date = new Date(time);
    if (date.getHours() === 0 && date.getMinutes() === 0) {
      return `${date.getDate()}`;
    }
    let minutes = `${date.getMinutes()}`;
    if (minutes.length < 2) {
      minutes = `0${minutes}`;
    }
    return `${date.getHours()}:${minutes}`;
  }

  valueToLabel(value, bonusPlaces) {
    bonusPlaces = bonusPlaces || 0;
    let labelText;
    if (this.property.type === 'boolean') {
      labelText = this.propertyLabel(value);
    } else if (Math.floor(value) === value) {
      labelText = value.toFixed(0);
    } else {
      const places = Math.max(
        0,
        2 + bonusPlaces - Math.log(this.valueMax - this.valueMin) / Math.LN10);
      labelText = value.toFixed(places);
    }
    return labelText;
  }

  removeAll(selector) {
    this.elt.querySelectorAll(selector).forEach((child) => {
      child.parentNode.removeChild(child);
    });
  }

  drawYTicks() {
    if (this.property.type !== 'boolean') {
      const incForTenTicks =
        Math.pow(10, Math.floor(Math.log(this.valueMax - this.valueMin) /
                                Math.LN10) - 1);
      let value = this.valueMin + incForTenTicks;
      let i = 1;
      while (value < this.valueMax) {
        const y = this.valueToY(value);
        let tickLength = 5;
        if (i % 5 === 0) {
          tickLength *= 1.5;
        }
        // Make a tick
        const tick = this.makePath([
          {x: this.xStart, y},
          {x: this.xStart + tickLength, y},
        ]);
        tick.classList.add('logs-graph-tick');
        this.graph.appendChild(tick);

        value += incForTenTicks;
        i += 1;
      }
    }

    // Make a final tick at valueMax, nudge it by 1 due to 2px width
    const tick = this.makePath([
      {x: this.xStart - 1, y: this.valueToY(this.valueMax) - 1},
      {x: this.xStart + 10, y: this.valueToY(this.valueMax) - 1},
    ]);
    tick.classList.add('logs-graph-tick', 'logs-graph-tick-big');
    this.graph.appendChild(tick);

    let label = this.makeText(this.valueToLabel(this.valueMin),
                              this.xStart - 5,
                              this.valueToY(this.valueMin), 'end', 'middle');
    label.classList.add('logs-graph-label');
    this.graph.appendChild(label);

    label = this.makeText(this.valueToLabel(this.valueMax),
                          this.xStart - 5,
                          this.valueToY(this.valueMax), 'end', 'middle');
    label.classList.add('logs-graph-label');
    this.graph.appendChild(label);
  }

  drawXTicks() {
    const oneMinuteMs = 60 * 1000;
    const oneHourMs = 60 * oneMinuteMs;
    const oneDayMs = 24 * oneHourMs;

    const reasonableTicks = [
      oneDayMs, 12 * oneHourMs, oneHourMs, 15 * oneMinuteMs, 5 * oneMinuteMs,
      oneMinuteMs,
    ];

    let i;
    for (i = 1; i < reasonableTicks.length - 1; i++) {
      const trialTick = reasonableTicks[i];
      const tickWidth = this.timeToX(trialTick) - this.timeToX(0);
      if (tickWidth < 48) {
        break;
      }
    }

    const tickIncrement = reasonableTicks[i];
    const bigTickIncrement = reasonableTicks[i - 1];

    const tickWidth = this.timeToX(tickIncrement) - this.timeToX(0);

    const flooredStart = this.floorDate(
      new Date(this.start.getTime())).getTime();
    let time = flooredStart;
    while (time < this.end.getTime()) {
      if (time > this.start.getTime()) {
        const x = this.timeToX(time);
        let tickHeight = 5;
        if ((time - flooredStart) % bigTickIncrement === 0) {
          // Big label of date
          const text = this.timeToLabel(time);
          const label = this.makeText(text, x, this.height - this.yMargin + 2,
                                      'middle', 'hanging');
          label.classList.add('logs-graph-label');
          this.graph.appendChild(label);
          tickHeight *= 2;
        } else if (tickWidth > 48) {
          // Big label if the small ticks are wider than expected
          const text = this.timeToLabel(time);
          const label = this.makeText(text, x, this.height - this.yMargin + 2,
                                      'middle', 'hanging');
          label.classList.add('logs-graph-label');
          this.graph.appendChild(label);
        }
        // Make a tick
        const tick = this.makePath([
          {x, y: this.height - this.yMargin},
          {x, y: this.height - this.yMargin - tickHeight},
        ]);
        tick.classList.add('logs-graph-tick');
        this.graph.appendChild(tick);
      }

      time += tickIncrement;
    }
  }

  drawScrollBar() {
    const barHeight = 16;
    const barY = this.height + this.scrollHeight / 2 - barHeight / 2;

    this.scrollBar = document.createElementNS('http://www.w3.org/2000/svg',
                                              'rect');
    this.scrollBar.classList.add('logs-scroll-bar');
    this.scrollBar.setAttribute('x', this.xStart);
    this.scrollBar.setAttribute('y', barY);
    this.scrollBar.setAttribute('width', this.graphWidth);
    this.scrollBar.setAttribute('height', barHeight);
    this.graph.appendChild(this.scrollBar);

    this.scrollControl =
      document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    this.scrollControl.classList.add('logs-scroll-control');
    this.scrollControl.setAttribute('y', barY);
    this.scrollControl.setAttribute('height', barHeight);
    this.graph.appendChild(this.scrollControl);

    const equiTri = 1 / Math.sqrt(3);
    const buttonScale = 16;
    const margin = 8;
    const barCenter = barY + barHeight / 2;

    this.scrollButtonLeft = this.makePath([
      {x: this.xStart - buttonScale - margin, y: barCenter},
      {x: this.xStart - margin, y: barCenter - buttonScale * equiTri},
      {x: this.xStart - margin, y: barCenter + buttonScale * equiTri},
    ], true);
    this.scrollButtonLeft.classList.add('logs-scroll-button');
    this.scrollButtonLeft.addEventListener('click', this.scrollLeft);
    this.graph.appendChild(this.scrollButtonLeft);

    const barEnd = this.xStart + this.graphWidth + margin;
    this.scrollButtonRight = this.makePath([
      {x: barEnd + buttonScale, y: barCenter},
      {x: barEnd, y: barCenter - buttonScale * equiTri},
      {x: barEnd, y: barCenter + buttonScale * equiTri},
    ], true);
    this.scrollButtonRight.classList.add('logs-scroll-button');
    this.scrollButtonRight.addEventListener('click', this.scrollRight);
    this.graph.appendChild(this.scrollButtonRight);
  }

  updateScrollBar() {
    let controlStart = this.timeToX(this.start.getTime(),
                                    this.logStart.getTime(),
                                    this.logEnd.getTime());
    let controlEnd = this.timeToX(this.end.getTime(), this.logStart.getTime(),
                                  this.logEnd.getTime());

    // Make sure control is wide enough to tap
    if (controlEnd - controlStart < 16) {
      controlEnd = controlStart + 16;
      if (controlEnd > this.xStart + this.graphWidth) {
        controlEnd = this.xStart + this.graphWidth;
        controlStart = controlEnd - 16;
      }
    }

    this.scrollControl.setAttribute('x', controlStart);
    this.scrollControl.setAttribute('width', controlEnd - controlStart);
  }

  scrollLeft() {
    const width = this.end.getTime() - this.start.getTime();
    this.scroll(-width / 2);
    this.storeWindow();
  }

  scrollRight() {
    const width = this.end.getTime() - this.start.getTime();
    this.scroll(width / 2);
    this.storeWindow();
  }

  scroll(amount) {
    let newStart = this.start.getTime() + amount;
    let newEnd = this.end.getTime() + amount;
    const width = newEnd - newStart;
    if (amount < 0 && newStart < this.logStart.getTime()) {
      newStart = this.logStart.getTime();
      newEnd = newStart + width;
    } else if (amount > 0 && newEnd > this.logEnd.getTime()) {
      newEnd = this.logEnd.getTime();
      newStart = newEnd - width;
    }
    this.start = new Date(newStart);
    this.end = new Date(newEnd);
    this.redraw();
  }

  /**
   * Return a label for a property's value
   */
  propertyLabel(value) {
    if (this.property.type === 'boolean') {
      switch (this.property['@type']) {
        case 'OnOffProperty':
          return value ? 'ON' : 'OFF';
        case 'MotionProperty':
          return value ? 'MOTION' : 'NO MOTION';
        case 'OpenProperty':
          return value ? 'OPEN' : 'CLOSED';
        case 'LeakProperty':
          return value ? 'LEAK' : 'DRY';
        case 'PushedProperty':
          return value ? 'PUSHED' : 'NOT PUSHED';
        case 'BooleanProperty':
        default:
          return value ? 'TRUE' : 'FALSE';
      }
    }
    return `${value}`;
  }

  /**
   * Convert a date to the start of its day, i.e. zero out hours, minutes, and
   * seconds.
   * TODO: support timezones
   */
  floorDate(date) {
    date.setHours(0);
    date.setMinutes(0);
    date.setSeconds(0);
    date.setMilliseconds(0);
    return date;
  }

  nearestIndex(time) {
    let start = 0;
    let end = this.rawPoints.length - 1;
    let mid = 0;
    while (end > start) {
      mid = Math.floor((start + end) / 2);
      if (this.rawPoints[mid].time < time) {
        start = mid + 1;
      } else if (this.rawPoints[mid].time > time) {
        end = mid - 1;
      } else {
        break;
      }
    }
    return mid;
  }

  nearestPoint(localX, localY) {
    const time = this.xToTime(localX);
    if (time < this.start.getTime() || time > this.end.getTime()) {
      return null;
    }

    const mid = this.nearestIndex(time);

    let nearestPoint = null;
    let nearestDSq = 2 * 50 * 50;

    // Trial the five nearest points
    for (let i = mid - 2; i < mid + 3; i++) {
      if (i < 0 || i > this.rawPoints.length - 1) {
        continue;
      }
      const dx = this.timeToX(this.rawPoints[i].time) - localX;
      const dy = this.valueToY(this.rawPoints[i].value) - localY;
      const diffSq = dx * dx + dy * dy;
      if (diffSq > nearestDSq) {
        continue;
      }
      nearestDSq = diffSq;
      nearestPoint = this.rawPoints[i];
    }
    return nearestPoint;
  }

  constrainTime(time) {
    if (time < this.start.getTime()) {
      return this.start.getTime();
    } else if (time > this.end.getTime()) {
      return this.end.getTime();
    }
    return time;
  }

  setPointerState(pointerState) {
    this.prevPointerState = this.pointerState;
    this.pointerState = pointerState;
  }

  convertTouchEvent(event) {
    event.isTouch = false;
    if (event.targetTouches) {
      if (event.targetTouches.length > 0) {
        event.clientX = event.targetTouches[0].clientX;
        event.clientY = event.targetTouches[0].clientY;
        event.isTouch = true;
      }
    }
  }

  onPointerDown(event) {
    event.preventDefault();

    this.convertTouchEvent(event);

    if (event.buttons === RIGHT_MOUSE_BUTTON) {
      return;
    }

    if (event.target.classList.contains('logs-scroll-control')) {
      const controlX = parseFloat(this.scrollControl.getAttribute('x'));
      this.setPointerState({
        action: SCROLLING,
        scrollOffset: event.clientX - controlX,
      });
    } else if (event.isTouch) {
      const rect = this.graph.getBoundingClientRect();
      this.drawTooltip(event.clientX - rect.left, event.clientY - rect.top);
      clearTimeout(this.touchTooltipTimeout);
      this.touchTooltipTimeout = setTimeout(() => {
        this.removeTooltip();
      }, 5000);
    } else {
      const rect = this.graph.getBoundingClientRect();
      const localY = event.clientY - rect.top;
      if (localY > this.graphHeight + this.yMargin) {
        // Actually clicking the background
        return;
      }
      this.setPointerState({
        action: DRAGGING,
        dragStart: this.constrainTime(this.xToTime(event.clientX)),
      });
    }
  }

  onPointerMove(event) {
    event.preventDefault();

    this.convertTouchEvent(event);

    // Restore a drag interrupted by the pointer leaving
    if (event.buttons === LEFT_MOUSE_BUTTON &&
        this.prevPointerState.action &&
        !this.pointerState.action) {
      this.setPointerState(this.prevPointerState);
    }
    if (this.pointerState.action === DRAGGING) {
      this.drawHighlight(event.clientX);
    } else if (this.pointerState.action === SCROLLING) {
      let newX = event.clientX - this.pointerState.scrollOffset;
      const scrollControlWidth =
        parseFloat(this.scrollControl.getAttribute('width'));
      const maxX = this.xStart + this.graphWidth - scrollControlWidth;
      if (newX < this.xStart) {
        newX = this.xStart;
      } else if (newX > maxX) {
        newX = maxX;
      }
      this.scrollControl.setAttribute('x', newX);
      this.finishScrolling();
    } else {
      const rect = this.graph.getBoundingClientRect();
      this.drawTooltip(event.clientX - rect.left, event.clientY - rect.top);
    }
  }

  drawHighlight(clientX) {
    const dragStartX = this.timeToX(this.pointerState.dragStart);
    let minX = Math.min(dragStartX, clientX);
    let maxX = Math.max(dragStartX, clientX);

    minX = Math.max(minX, this.xStart);
    maxX = Math.min(maxX, this.graphWidth + this.xStart);

    this.selectionHighlight.setAttribute('x', minX);
    this.selectionHighlight.setAttribute('width', maxX - minX);
  }

  removeHighlight() {
    this.selectionHighlight.setAttribute('width', 0);
  }

  drawTooltip(localX, localY) {
    if (!this.property || !this.rawPoints || this.rawPoints.length === 0) {
      return;
    }

    const point = this.nearestPoint(localX, localY);
    if (!point) {
      this.removeTooltip();
      return;
    }
    const x = this.timeToX(point.time);
    const y = this.valueToY(point.value);
    this.tooltip.style.display = 'block';
    this.tooltip.style.transform = `translate(${x}px,${y}px)`;
    const valueLabel = this.valueToLabel(point.value, 2);

    const unit = Utils.unitNameToAbbreviation(this.property.unit || '');
    this.tooltipValue.textContent = `${valueLabel} ${unit}`;

    // const dateParts = new Date(point.time).toDateString().split(' ');
    // this.tooltipDate.textContent = `${dateParts[1]} ${dateParts[2]}`;
    const dateParts = new Date(point.time).toTimeString().split(' ');
    this.tooltipDate.textContent = `${dateParts[0]}`;

    if (!this.pointHighlight) {
      this.pointHighlight =
        document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      this.pointHighlight.classList.add('logs-graph-point-highlight');
      this.pointHighlight.setAttribute('r', 3);
      this.graph.appendChild(this.pointHighlight);
    }
    this.pointHighlight.setAttribute('cx', x);
    this.pointHighlight.setAttribute('cy', y);
  }

  onPointerLeave() {
    this.removeTooltip();
    this.removeHighlight();
    if (this.pointerState.action === SCROLLING) {
      this.finishScrolling();
      this.storeWindow();
    }
    this.setPointerState({});
  }

  onPointerUp(event) {
    event.preventDefault();
    this.convertTouchEvent(event);

    this.removeHighlight();

    if (this.pointerState.action === SCROLLING) {
      this.finishScrolling();
    } else if (this.pointerState.action === DRAGGING) {
      const dragEnd = this.constrainTime(this.xToTime(event.clientX));
      if (Math.abs(dragEnd - this.pointerState.dragStart) < 30 * 1000) {
        // Drag was way too small (<30s)
        this.setPointerState({});
        return;
      }
      let newStart, newEnd;
      if (this.pointerState.dragStart < dragEnd) {
        newStart = new Date(this.pointerState.dragStart);
        newEnd = new Date(dragEnd);
      } else {
        newStart = new Date(dragEnd);
        newEnd = new Date(this.pointerState.dragStart);
      }
      this.start = newStart;
      this.end = newEnd;
      this.redraw();
    }
    if (event.button === RIGHT_MOUSE_BUTTON) {
      this.start = this.logStart;
      this.end = this.logEnd;
      this.weekDropdown.value = 7 * 24 * 60 * 60 * 1000;
      this.redraw();
    }
    this.setPointerState({});
    this.storeWindow();
  }

  finishScrolling() {
    const controlX = parseFloat(this.scrollControl.getAttribute('x'));
    const controlTime = this.xToTime(controlX, this.logStart.getTime(),
                                     this.logEnd.getTime());
    const delta = controlTime - this.start.getTime();
    this.scroll(delta);
  }

  removeTooltip() {
    this.tooltip.style.display = 'none';
    if (this.pointHighlight) {
      this.pointHighlight.parentNode.removeChild(this.pointHighlight);
      this.pointHighlight = null;
    }
  }

  restoreWindow() {
    const storageId = `Logs.${this.thingId}.${this.propertyId}`;
    const dataRaw = window.localStorage.getItem(storageId);
    if (!dataRaw) {
      return;
    }
    try {
      const data = JSON.parse(dataRaw);
      if (!data.start || !data.end) {
        return;
      }
      const start = parseInt(data.start);
      const end = parseInt(data.end);
      this.start = new Date(start);
      this.end = new Date(end);
    } catch (e) {
      console.warn('Unexpected junk in window storage', e);
    }
  }

  storeWindow() {
    const storageId = `Logs.${this.thingId}.${this.propertyId}`;
    window.localStorage.setItem(storageId, JSON.stringify({
      start: this.start.getTime(),
      end: this.end.getTime(),
    }));
  }
}

module.exports = Log;
