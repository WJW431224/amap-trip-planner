import { describe, expect, it } from 'vitest';
import {
  dayColor,
  formatDistance,
  formatDuration,
  pointLetter,
  shortName,
} from './format';

describe('formatDistance', () => {
  it('uses meters below one kilometer', () => {
    expect(formatDistance(0)).toBe('1 米');
    expect(formatDistance(850)).toBe('850 米');
  });

  it('uses kilometers with one decimal below ten kilometers', () => {
    expect(formatDistance(1500)).toBe('1.5 公里');
    expect(formatDistance(9800)).toBe('9.8 公里');
  });

  it('rounds longer distances', () => {
    expect(formatDistance(12400)).toBe('12 公里');
  });

  it('handles missing values', () => {
    expect(formatDistance(undefined)).toBe('—');
  });
});

describe('formatDuration', () => {
  it('rounds to minutes', () => {
    expect(formatDuration(90)).toBe('2 分钟');
    expect(formatDuration(600)).toBe('10 分钟');
  });

  it('formats hours and minutes', () => {
    expect(formatDuration(3600)).toBe('1 小时');
    expect(formatDuration(5400)).toBe('1 小时 30 分');
  });
});

describe('pointLetter', () => {
  it('uses letters then numbers', () => {
    expect(pointLetter(0)).toBe('A');
    expect(pointLetter(25)).toBe('Z');
    expect(pointLetter(26)).toBe('27');
  });
});

describe('dayColor', () => {
  it('gives each day a distinct color and wraps around', () => {
    expect(dayColor(1)).not.toBe(dayColor(2));
    expect(dayColor(2)).not.toBe(dayColor(3));
    expect(dayColor(1)).toBe(dayColor(6));
  });
});

describe('shortName', () => {
  it('去掉省市区的行政前缀', () => {
    expect(shortName('浙江省杭州市西湖区蒋村花园')).toBe('蒋村花园');
    expect(shortName('浙江省杭州市上城区紫金港路21号')).toBe('紫金港路21号');
  });

  it('短名字不动', () => {
    expect(shortName('杭州东站')).toBe('杭州东站');
    expect(shortName('西湖区图书馆')).toBe('西湖区图书馆');
  });

  it('太长才截断', () => {
    const value = shortName('某某某某某某某某某某某某某某某某某某');
    expect(value.endsWith('…')).toBe(true);
  });
});
