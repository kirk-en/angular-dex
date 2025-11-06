import { Injectable } from '@angular/core';
import Meyda, { MeydaFeaturesObject } from 'meyda';

/**
 * TypeScript Interface: Define outside the class
 *
 * Interfaces must be declared at the top level (outside classes)
 * They describe the shape of data, not class members
 */
interface AudioFeatures {
  rms: number; // Root Mean Square - loudness (0-1 range typically)
  spectralCentroid: number; // "Brightness" - where most energy is frequency-wise
  zcr: number; // Zero Crossing Rate - pitch estimation (0-1 range)
  energy: number; // Overall energy of the signal
}

@Injectable({
  providedIn: 'root',
})
export class AudioAnalysisService {
  constructor() {}

  extractFeatures(audioBuffer: AudioBuffer): AudioFeatures | null {
    if (!audioBuffer || audioBuffer.length === 0) {
      console.warn('AudioBuffer is empty or invalid');
      return null;
    }

    /**
     * Meyda requires buffer size to be a power of 2
     *
     * Powers of 2: 64, 128, 256, 512, 1024, 2048, 4096, etc.
     *
     * Why? FFT (Fast Fourier Transform) - the algorithm Meyda uses for spectral analysis
     * works most efficiently with power-of-2 sizes. It's a mathematical property!
     *
     * Strategy: Take the first 4096 samples (a valid power of 2)
     * This gives us enough audio to analyze without processing the entire buffer
     *
     * TypeScript: We use Math.min to ensure we don't exceed buffer length:
     * - If buffer has 10,000 samples: take 4,096
     * - If buffer has 2,000 samples: take 2,000
     */
    const bufferSize: number = 4096; // Power of 2
    const sampleLength: number = Math.min(bufferSize, audioBuffer.length);

    /**
     * Extract audio data from first channel
     *
     * slice(0, sampleLength) creates a new Float32Array with only the samples we need
     * This is like taking a "chunk" of the audio
     *
     * TypeScript: slice() returns a new Float32Array
     */
    const signal: Float32Array = audioBuffer.getChannelData(0).slice(0, sampleLength);

    try {
      /**
       * Extract features with the correctly-sized buffer
       *
       * Now Meyda will accept this because signal.length is 4096
       * (assuming our original buffer had at least 4096 samples)
       */
      const features = Meyda.extract(['rms', 'spectralCentroid', 'zcr', 'energy'], signal);
      return features as AudioFeatures;
    } catch (error) {
      console.error('Error analyzing audio with Meyda:', error);
      return null;
    }
  }

  calculateSimilarity(features1: AudioFeatures, features2: AudioFeatures): number {
    /**
     * Calculate differences for each feature
     *
     * Math.abs(): Get absolute difference (distance between values)
     * Lower difference = more similar
     *
     * TypeScript ensures:
     * - features1.rms is a number (can't be string or undefined)
     * - features2.rms exists (can't typo as features2.rmse)
     *
     * If you typo: const rmsDiff = Math.abs(features1.rms - features2.rns);
     * TypeScript error: Property 'rns' does not exist on type 'AudioFeatures'
     */
    const rmsDiff: number = Math.abs(features1.rms - features2.rms);
    const spectralDiff: number = Math.abs(features1.spectralCentroid - features2.spectralCentroid);
    const zcrDiff: number = Math.abs(features1.zcr - features2.zcr);
    const energyDiff: number = Math.abs(features1.energy - features2.energy);

    /**
     * Normalize differences to 0-100 scale
     *
     * These constants are rough normalizations based on typical value ranges:
     * - RMS ranges 0-1, so multiply by 100
     * - Spectral Centroid ranges 0-10000, so divide by 100
     * - ZCR ranges 0-1, so multiply by 100
     *
     * Lower difference = higher similarity score
     *
     * Math.max(0, ...) ensures we never go below 0
     */
    const rmsSimilarity: number = Math.max(0, 100 - rmsDiff * 100);
    const spectralSimilarity: number = Math.max(0, 100 - spectralDiff / 100);
    const zcrSimilarity: number = Math.max(0, 100 - zcrDiff * 100);
    const energySimilarity: number = Math.max(0, 100 - energyDiff * 100);

    /**
     * Weighted average of all similarities
     *
     * TypeScript ensures all variables are numbers
     * If any calculation returned a string, this line would error at compile time
     *
     * Weights:
     * - RMS (30%): Loudness is important
     * - Spectral Centroid (30%): Tone/brightness matters
     * - ZCR (20%): Pitch similarity
     * - Energy (20%): Overall power
     *
     * Returns a number between 0-100 (percentage similarity)
     */
    const overallSimilarity: number =
      rmsSimilarity * 0.3 + spectralSimilarity * 0.3 + zcrSimilarity * 0.2 + energySimilarity * 0.2;

    /**
     * Round to 2 decimal places for cleaner display
     *
     * TypeScript knows:
     * - overallSimilarity is a number
     * - toFixed(2) returns a string
     * - parseFloat() converts back to number
     * - Final return type matches our method signature (number)
     */
    return parseFloat(overallSimilarity.toFixed(2));
  }
}
