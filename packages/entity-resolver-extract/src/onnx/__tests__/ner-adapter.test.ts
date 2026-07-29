import { describe, it, expect, afterEach } from 'vitest';
import { onnxExtract, isOnnxAvailable, resetOnnxState, getOnnxError } from '../ner-adapter.js';

/**
 * ONNX NER Adapter Tests.
 *
 * Tests graceful degradation (model may not be available in sandbox)
 * and structural correctness of the adapter.
 */

describe('onnxExtract', () => {
  afterEach(() => {
    resetOnnxState();
  });

  it('isOnnxAvailable returns false before initialization', () => {
    resetOnnxState();
    expect(isOnnxAvailable()).toBe(false);
  });

  it('getOnnxError returns null before any error', () => {
    resetOnnxState();
    expect(getOnnxError()).toBeNull();
  });

  it('returns null values when model fails to load gracefully', async () => {
    resetOnnxState();
    const result = await onnxExtract('test text', [{ name: 'person', type: 'string' }]);
    // Should not throw — graceful degradation
    expect(result.values).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it('handles empty fields array', async () => {
    resetOnnxState();
    const result = await onnxExtract('test text', []);
    expect(result.values).toBeNull();
  });

  it('handles empty text', async () => {
    resetOnnxState();
    const result = await onnxExtract('', [{ name: 'city', type: 'string' }]);
    expect(result.values).toBeNull();
  });

  it('resetOnnxState clears error and model state', () => {
    resetOnnxState();
    expect(isOnnxAvailable()).toBe(false);
    expect(getOnnxError()).toBeNull();
  });
});
