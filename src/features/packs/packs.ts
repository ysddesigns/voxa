import { VoxaEngine } from '../../../modules/voxa-engine';
import { DEV_CATALOGUE, runsOn, type Pack } from './catalogue';
import { PackService, type PackNative } from './pack-service';

/**
 * The app's pack catalogue and download service.
 * The catalogue is DEV_CATALOGUE until the CDN exists; then it is fetched, checked with
 * parseCatalogue and cached, and this module is the one place that changes.
 */

export function catalogue() {
  return DEV_CATALOGUE;
}

/** Voice packs that run on this phone's tier. */
export function catalogueVoices(tier: Parameters<typeof runsOn>[1] = 'lite'): Pack[] {
  return catalogue().packs.filter((p) => p.kind === 'voice' && runsOn(p, tier));
}

/** Null in builds without the native downloader (iOS for now, Jest, older Android builds). */
export const packService: PackService | null = VoxaEngine?.installPack ? new PackService(VoxaEngine as unknown as PackNative) : null;
