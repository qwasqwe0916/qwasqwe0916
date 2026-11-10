import { useEffect, useState } from 'react';
import { api } from './api';

// 카테고리, 기술 스택처럼 자주 바뀌지 않는 선택지 목록을 한 번 불러온다
export function useOptions(path) {
  const [options, setOptions] = useState([]);
  useEffect(() => {
    api.get(path).then(setOptions).catch(() => setOptions([]));
  }, [path]);
  return options;
}
