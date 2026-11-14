import { apiRequest } from './api';

export async function fetchDIYRecommendations(material, audience = 'user') {
  const params = new URLSearchParams({ material, audience });
  return apiRequest(`/recommendations/diy?${params.toString()}`);
}
