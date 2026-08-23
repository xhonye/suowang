UPDATE states
SET cue = '休息好，才能重新出发。'
WHERE id = 'restore'
  AND cue = '让身体和注意力重新可用';
