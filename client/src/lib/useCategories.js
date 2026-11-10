import { useEffect, useState } from 'react';
import { api } from './api';

// 카테고리 목록을 한 번 불러온다
export function useCategories() {
  const [categories, setCategories] = useState([]);
  useEffect(() => {
    api.get('/api/categories').then(setCategories).catch(() => setCategories([]));
  }, []);
  return categories;
}
