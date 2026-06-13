const KEY = "spark_korean_reader_v1";
const SETTINGS = "spark_korean_reader_settings_v1";

export function loadRecords() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveRecord(record) {
  const records = loadRecords().filter((item) => item.id !== record.id);
  records.unshift(record);
  localStorage.setItem(KEY, JSON.stringify(records.slice(0, 60)));
  return records;
}

export function deleteRecord(id) {
  const records = loadRecords().filter((item) => item.id !== id);
  localStorage.setItem(KEY, JSON.stringify(records));
  return records;
}

export function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS) || "{}");
  } catch {
    return {};
  }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS, JSON.stringify(settings));
}
