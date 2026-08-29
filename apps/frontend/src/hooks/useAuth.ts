import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import { fetchCurrentUser, logout as logoutRequest } from '../services/authService';

export function useAuth() {
  const query = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: fetchCurrentUser,
    retry: false,
  });

  const queryClient = useQueryClient();
  const logoutMutation = useMutation({
    mutationFn: logoutRequest,
    onSuccess: () => {
      queryClient.setQueryData(['auth', 'me'], undefined);
      queryClient.clear();
    },
  });

  return {
    user: query.data,
    isLoading: query.isLoading,
    isAuthenticated: Boolean(query.data) && !query.isError,
    error: query.error,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}
