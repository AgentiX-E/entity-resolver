import { describe, it, expect } from 'vitest';
import { onnxExtract, isOnnxAvailable } from '../ner-adapter.js';

describe('onnxExtract (stub)', () => {
  it('returns null values (stub implementation)', async () => {
    const result = await onnxExtract('test text', [{ name: 'field', type: 'string' }]);
    expect(result.values).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it('isOnnxAvailable returns false (stub)', () => {
    expect(isOnnxAvailable()).toBe(false);
  });

  it('handles empty fields array', async () => {
    const result = await onnxExtract('test text', []);
    expect(result.values).toBeNull();
  });
});
