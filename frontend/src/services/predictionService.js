import { apiRequest } from './api';

export async function checkBackendHealth() {
  return apiRequest('/health');
}

export async function predictCombined(file, isBottle = false) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('is_bottle', String(Boolean(isBottle)));

  return apiRequest('/predict', {
    method: 'POST',
    body: formData,
    headers: {},
  });
}

export async function predictMaterial(file) {
  const formData = new FormData();
  formData.append('file', file);

  return apiRequest('/predict/material', {
    method: 'POST',
    body: formData,
    headers: {},
  });
}

export async function predictBrand(file) {
  const formData = new FormData();
  formData.append('file', file);

  return apiRequest('/predict/brand', {
    method: 'POST',
    body: formData,
    headers: {},
  });
}
