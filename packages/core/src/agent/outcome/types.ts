export type GoalOutcome=
 |{status:"success";verified:true;evidence?:string[]}
 |{status:"partial";verified:true;unmetGoals:string[];evidence?:string[]}
 |{status:"failed";verified:true;reason:string;evidence?:string[]}
 |{status:"unknown";verified:false;reason?:string};
