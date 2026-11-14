import { healthApi, type HealthProfile } from '../../lib/health-api'

export async function loadWorkoutProfile(): Promise<HealthProfile> {
  const profile = await healthApi.getProfile()
  if (typeof window === 'undefined' || profile.initialized) return profile
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return timezone ? healthApi.updateProfile({ unitPreference: profile.unitPreference, timezone }) : profile
}
