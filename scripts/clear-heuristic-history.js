#!/usr/bin/env node
/**
 * Deletes persisted search history rows that are heuristic (stored or inferred).
 * Run from project root: node scripts/clear-heuristic-history.js
 * Prefer POST /api/history/clear-heuristic with { "confirm": true } when the API is up.
 */

const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { clearHeuristicHistoryEntries } = require('../src/services/searchHistoryService');

const out = clearHeuristicHistoryEntries();
console.log(`[clear-heuristic-history] removed ${out.removedCount} heuristic entries.`);
