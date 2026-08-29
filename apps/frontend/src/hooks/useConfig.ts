import { useQuery } from '@tanstack/react-query';
import { fetchSchedulingDefaults } from '../services/configService';

export function useSchedulingDefaults() {
  return useQuery({
    queryKey: ['config', 'defaults'],
    queryFn: fetchSchedulingDefaults,
    staleTime: Infinity,
  });
}
