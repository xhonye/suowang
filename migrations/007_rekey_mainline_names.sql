UPDATE mainlines
SET normalized_name = CASE
  WHEN status = 'active' THEN 'active:' || state_id || ':' || normalized_name
  ELSE 'history:' || id
END;
