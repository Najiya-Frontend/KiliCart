import { Platform } from 'react-native';

export const colors = {
  forest: '#244B36', green: '#3F7651', leaf: '#83A36D', pale: '#EDF3E9',
  canvas: '#F8F9F5', paper: '#FFFFFF', ink: '#203129', muted: '#78847C',
  line: '#E4E9E1', gold: '#B88750', danger: '#A64C3F', success: '#4B7B55',
};
export const space = { xs: 5, sm: 9, md: 15, lg: 21, xl: 28, xxl: 38 };
export const radii = { sm: 10, md: 16, lg: 23, pill: 999 };
export const shadow = Platform.select({
  ios: { shadowColor: '#1D3828', shadowOpacity: 0.08, shadowOffset: { width: 0, height: 5 }, shadowRadius: 14 },
  android: { elevation: 2 }, default: {},
});
