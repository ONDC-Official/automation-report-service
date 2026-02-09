export function detectIgmVersion(message: any): '1.0.0' | '2.0.0' {
  const issue = message?.issue;
  
  if (!issue) return '2.0.0';
  
  const igm1Indicators = [
    issue.category !== undefined,
    issue.sub_category !== undefined,
    issue.complainant_info !== undefined,
    issue.order_details !== undefined,
    issue.issue_actions !== undefined,
    issue.issue_type !== undefined,
    issue.source?.network_participant_id !== undefined,
    issue.description !== undefined,
  ];
  
  const igm2Indicators = [
    issue.level !== undefined,
    issue.refs !== undefined && Array.isArray(issue.refs),
    issue.actors !== undefined && Array.isArray(issue.actors),
    issue.actions !== undefined && Array.isArray(issue.actions),
    issue.source_id !== undefined,
    issue.complainant_id !== undefined,
    issue.descriptor?.code !== undefined,
    message?.update_target !== undefined,
  ];
  
  const igm1Score = igm1Indicators.filter(Boolean).length;
  const igm2Score = igm2Indicators.filter(Boolean).length;
  
  return igm1Score >= igm2Score ? '1.0.0' : '2.0.0';
}
