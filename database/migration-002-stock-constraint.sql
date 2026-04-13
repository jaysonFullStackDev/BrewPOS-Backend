-- Migration 002: Prevent negative stock (race condition fix)
-- Run: psql -U postgres -d brewpos -f database/migration-002-stock-constraint.sql

ALTER TABLE ingredients
  ADD CONSTRAINT stock_qty_non_negative CHECK (stock_qty >= 0);
