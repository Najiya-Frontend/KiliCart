process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.invalid/api/v1';
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));
