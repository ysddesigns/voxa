import { warmUpJobs } from '../warm-up';

describe('warmUpJobs', () => {
  it('warms only one model on a Lite phone: listening when unknown', () => {
    expect(warmUpJobs({ tier: 'lite', listenReady: true, lastUsed: '', voicePack: '' })).toEqual(['listen']);
  });

  it('warms the voice first on a Lite phone when the person last spoke', () => {
    expect(warmUpJobs({ tier: 'lite', listenReady: true, lastUsed: 'speak', voicePack: 'voice-yo' })).toEqual(['voice:voice-yo']);
  });

  it('warms the voice when listening is not downloaded', () => {
    expect(warmUpJobs({ tier: 'lite', listenReady: false, lastUsed: 'listen', voicePack: '' })).toEqual(['voice:']);
  });

  it('warms both, most likely first, on bigger phones', () => {
    expect(warmUpJobs({ tier: 'standard', listenReady: true, lastUsed: 'speak', voicePack: '' })).toEqual(['voice:', 'listen']);
    expect(warmUpJobs({ tier: 'pro', listenReady: true, lastUsed: 'listen', voicePack: '' })).toEqual(['listen', 'voice:']);
  });
});
