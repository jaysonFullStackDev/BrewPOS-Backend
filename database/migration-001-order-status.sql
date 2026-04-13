-- Migration 001: Add order status for Kitchen Display System
-- Run: psql -U postgres -d brewpos -f database/migration-001-order-status.sql

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS order_status VARCHAR(20)
    DEFAULT 'pending'
    CHECK (order_status IN ('pending', 'preparing', 'ready', 'completed'));

CREATE INDEX IF NOT EXISTS idx_sales_order_status ON sales(order_status);
