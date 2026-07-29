/**
 * ONNX NER Adapter — Zero-shot entity extraction via GLiNER ONNX model.
 *
 * Layer 2 of the extraction cascade (Pattern → ONNX → LLM).
 *
 * Uses the `gliner` TypeScript package which wraps @xenova/transformers
 * to run GLiNER models via ONNX Runtime. GLiNER performs zero-shot NER:
 * given text + entity type labels, it predicts spans without training.
 *
 * Model: GLiNER-small-v2.1 (~50MB ONNX), downloaded on first use.
 * Lazy initialization with graceful degradation.
 *
 * Reference: https://github.com/urchade/GLiNER
 */

import type { FieldDescriptor } from '../extractor.js';

export interface OnnxExtractResult {
  values: Record<string, unknown> | null;
  confidence: number;
}

interface GlinerEntity {
  entity: string;
  text: string;
  score: number;
}

interface GlinerWrapper {
  extract: (text: string, labels: string[]) => Promise<GlinerEntity[]>;
}

let modelLoaded = false;
let modelLoadError: string | null = null;
let glinerWrapper: GlinerWrapper | null = null;

export async function onnxExtract(
  text: string,
  fields: FieldDescriptor[],
): Promise<OnnxExtractResult> {
  if (modelLoadError) return { values: null, confidence: 0 };

  if (!modelLoaded) {
    try {
      await initializeModel();
    } catch (err) {
      modelLoadError = err instanceof Error ? err.message : String(err);
      return { values: null, confidence: 0 };
    }
  }

  if (!glinerWrapper) return { values: null, confidence: 0 };

  try {
    const labels = fields.map((f) => f.name);
    const entities = await glinerWrapper.extract(text, labels);

    if (!entities || entities.length === 0) {
      return { values: null, confidence: 0 };
    }

    const values: Record<string, unknown> = {};
    for (const entity of entities) {
      const label = entity.entity ?? '';
      if (label && fields.some((f) => f.name === label)) {
        if (!(label in values)) {
          values[label] = entity.text ?? '';
        }
      }
    }

    const avgConfidence = entities.reduce((sum, e) => sum + (e.score ?? 0.5), 0) / entities.length;

    return {
      values: Object.keys(values).length > 0 ? values : null,
      confidence: Math.min(avgConfidence, 0.85),
    };
  } catch {
    return { values: null, confidence: 0 };
  }
}

export function isOnnxAvailable(): boolean {
  return modelLoaded && glinerWrapper !== null && !modelLoadError;
}

export function getOnnxError(): string | null {
  return modelLoadError;
}

export function resetOnnxState(): void {
  modelLoaded = false;
  modelLoadError = null;
  glinerWrapper = null;
}

// ─── Internal initialization ────────────────────────────────────────

async function initializeModel(): Promise<void> {
  try {
    // Dynamic import — only loaded when ONNX is needed
    const { Gliner } = await import('gliner');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const instance = new Gliner({
      tokenizerPath: 'https://huggingface.co/urchade/gliner_small-v2.1/resolve/main/tokenizer.json',
      onnxSettings: {
        modelPath: 'https://huggingface.co/urchade/gliner_small-v2.1/resolve/main/onnx/model.onnx',
      },
      maxWidth: 512,
      modelType: 'base',
    });

    glinerWrapper = {
      extract: async (inputText: string, labels: string[]) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (instance as any).extract({
          texts: [inputText],
          entities: labels,
          flatNer: true,
          threshold: 0.3,
        });

        if (!result || !Array.isArray(result)) return [];
        // Gliner returns nested results — flatten entity arrays
        return result
          .flat()
          .filter((e: GlinerEntity) => e?.entity && e?.text)
          .map((e: GlinerEntity) => ({
            entity: e.entity,
            text: e.text,
            score: e.score ?? 0.5,
          }));
      },
    };

    modelLoaded = true;
  } catch (err) {
    throw new Error(
      `GLiNER model initialization failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
