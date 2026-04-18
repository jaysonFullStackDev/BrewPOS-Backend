// tests/validate.test.js
const request = require('supertest');
const express = require('express');
const { loginRules, processSaleRules, createExpenseRules } = require('../middleware/validate');

// Mini Express app to test validation middleware in isolation
function createTestApp(rules, handler) {
  const app = express();
  app.use(express.json());
  app.post('/test', rules, handler || ((req, res) => res.json({ ok: true })));
  return app;
}

describe('loginRules', () => {
  const app = createTestApp(loginRules);

  it('rejects missing email', async () => {
    const res = await request(app).post('/test').send({ password: '123456' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('email');
  });

  it('rejects invalid email', async () => {
    const res = await request(app).post('/test').send({ email: 'notanemail', password: '123456' });
    expect(res.status).toBe(400);
  });

  it('rejects missing password', async () => {
    const res = await request(app).post('/test').send({ email: 'test@test.com' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Password');
  });

  it('passes valid input', async () => {
    const res = await request(app).post('/test').send({ email: 'test@test.com', password: '123456' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe('processSaleRules', () => {
  const app = createTestApp(processSaleRules);

  it('rejects empty items', async () => {
    const res = await request(app).post('/test').send({ items: [], payment_method: 'cash' });
    expect(res.status).toBe(400);
  });

  it('rejects invalid payment method', async () => {
    const res = await request(app).post('/test').send({
      items: [{ product_id: '550e8400-e29b-41d4-a716-446655440000', quantity: 1 }],
      payment_method: 'bitcoin',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('payment method');
  });

  it('rejects quantity < 1', async () => {
    const res = await request(app).post('/test').send({
      items: [{ product_id: '550e8400-e29b-41d4-a716-446655440000', quantity: 0 }],
      payment_method: 'cash',
    });
    expect(res.status).toBe(400);
  });

  it('passes valid sale', async () => {
    const res = await request(app).post('/test').send({
      items: [{ product_id: '550e8400-e29b-41d4-a716-446655440000', quantity: 2 }],
      payment_method: 'cash',
      order_type: 'dine_in',
    });
    expect(res.status).toBe(200);
  });

  it('rejects invalid order_type', async () => {
    const res = await request(app).post('/test').send({
      items: [{ product_id: '550e8400-e29b-41d4-a716-446655440000', quantity: 1 }],
      payment_method: 'cash',
      order_type: 'delivery',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('order type');
  });
});

describe('createExpenseRules', () => {
  const app = createTestApp(createExpenseRules);

  it('rejects invalid category', async () => {
    const res = await request(app).post('/test').send({
      category: 'gambling', description: 'test', amount: 100,
    });
    expect(res.status).toBe(400);
  });

  it('rejects zero amount', async () => {
    const res = await request(app).post('/test').send({
      category: 'utilities', description: 'Electric bill', amount: 0,
    });
    expect(res.status).toBe(400);
  });

  it('passes valid expense', async () => {
    const res = await request(app).post('/test').send({
      category: 'utilities', description: 'Electric bill', amount: 500.50,
    });
    expect(res.status).toBe(200);
  });
});
