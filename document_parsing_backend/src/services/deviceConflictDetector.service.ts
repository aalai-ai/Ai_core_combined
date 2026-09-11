import { logger } from '../utils/logger';

export interface DeviceIdentity {
  documentId: string;
  originalName: string;
  manufacturer?: string;
  modelName?: string;
  deviceType?: string;
}

export interface ConflictCheckResult {
  conflictDetected: boolean;
  detectedDevices: DeviceIdentity[];
  message?: string;
}

export class DeviceConflictDetectorService {
  /**
   * Analyzes an array of device identity metadata items from uploaded files.
   * Detects if multiple distinct device models/manufacturers are present.
   */
  public checkConflicts(documents: DeviceIdentity[]): ConflictCheckResult {
    if (!documents || documents.length <= 1) {
      return {
        conflictDetected: false,
        detectedDevices: documents || [],
      };
    }

    const uniqueDevices: DeviceIdentity[] = [];
    const seenSignatures = new Set<string>();

    for (const doc of documents) {
      const mfg = (doc.manufacturer || '').trim().toLowerCase();
      const model = (doc.modelName || '').trim().toLowerCase();
      const type = (doc.deviceType || '').trim().toLowerCase();

      // Create a unique signature combining manufacturer & model or document name fallback
      const signature = `${mfg}|${model}|${type}`;
      
      if (signature !== "||" && !seenSignatures.has(signature)) {
        seenSignatures.add(signature);
        uniqueDevices.push(doc);
      }
    }

    if (uniqueDevices.length >= 2) {
      logger.info(`[DeviceConflictDetector] Multi-device conflict detected across ${uniqueDevices.length} distinct devices.`);
      return {
        conflictDetected: true,
        detectedDevices: uniqueDevices,
        message: `⚠️ Multi-Device Conflict: Uploaded files contain ${uniqueDevices.length} different devices (${uniqueDevices.map(d => d.modelName || d.originalName).join(', ')}).`,
      };
    }

    return {
      conflictDetected: false,
      detectedDevices: uniqueDevices.length > 0 ? uniqueDevices : documents,
    };
  }
}
