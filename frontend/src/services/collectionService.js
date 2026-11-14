import { apiRequest } from './api';

export async function fetchCollectionRecommendations({ material, condition, quantity_kg, latitude, longitude }) {
  const params = new URLSearchParams({
    material,
    condition,
    quantity_kg: String(quantity_kg),
    latitude: String(latitude),
    longitude: String(longitude),
  });

  return apiRequest(`/recommendations/collection-points?${params.toString()}`);
}
