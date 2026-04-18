// tests/security.test.js
const { sanitizeBody, checkAccountLockout, recordFailedLogin, clearFailedLogins } = require('../middleware/security');

// Helper to create mock req/res/next
const mockReq = (body = {}) => ({ body });
const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};
const mockNext = jest.fn();

describe('sanitizeBody', () => {
  beforeEach(() => mockNext.mockClear());

  it('strips HTML tags from string fields', () => {
    const req = mockReq({ name: '<script>alert("xss")</script>Hello', price: 100 });
    sanitizeBody(req, mockRes(), mockNext);
    expect(req.body.name).toBe('alert("xss")Hello');
    expect(req.body.price).toBe(100);
    expect(mockNext).toHaveBeenCalled();
  });

  it('strips javascript: protocol', () => {
    const req = mockReq({ url: 'javascript:alert(1)' });
    sanitizeBody(req, mockRes(), mockNext);
    expect(req.body.url).not.toContain('javascript:');
    expect(mockNext).toHaveBeenCalled();
  });

  it('passes through clean strings unchanged', () => {
    const req = mockReq({ name: 'Iced Latte', notes: 'Extra shot' });
    sanitizeBody(req, mockRes(), mockNext);
    expect(req.body.name).toBe('Iced Latte');
    expect(req.body.notes).toBe('Extra shot');
  });

  it('handles empty body', () => {
    const req = mockReq({});
    sanitizeBody(req, mockRes(), mockNext);
    expect(mockNext).toHaveBeenCalled();
  });
});

describe('Account Lockout', () => {
  beforeEach(() => {
    mockNext.mockClear();
    clearFailedLogins('test@example.com');
  });

  it('allows login when not locked', () => {
    const req = mockReq({ email: 'test@example.com' });
    const res = mockRes();
    checkAccountLockout(req, res, mockNext);
    expect(mockNext).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('locks account after 5 failed attempts', () => {
    for (let i = 0; i < 5; i++) {
      recordFailedLogin('test@example.com');
    }
    const req = mockReq({ email: 'test@example.com' });
    const res = mockRes();
    checkAccountLockout(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('locked') })
    );
  });

  it('clears lockout after clearFailedLogins', () => {
    for (let i = 0; i < 5; i++) {
      recordFailedLogin('test@example.com');
    }
    clearFailedLogins('test@example.com');
    const req = mockReq({ email: 'test@example.com' });
    const res = mockRes();
    checkAccountLockout(req, res, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });
});
