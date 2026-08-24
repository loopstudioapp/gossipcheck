DELETE FROM profiles
WHERE id IN (
  SELECT DISTINCT s.profile_id
  FROM scans s
  JOIN evidence e ON e.scan_id = s.id
  WHERE e.reasons_json LIKE '%"Example report"%'
);
