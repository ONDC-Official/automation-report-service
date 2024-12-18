import { Payload } from "../../../types/payload";
import { expect } from 'chai';

export function checkSearch(payload: Payload){
    let srchObj:any ={};
 
        const jsonRequest = payload?.jsonRequest as any;
    
        // BDD-style validation: context validation
        describe('Validating search payload', () => {
            it('should have a valid context with transactionId and timestamp', () => {
                const { context } = jsonRequest;
                expect(context).to.have.property('transaction_id').that.is.a('string').and.is.not.empty;
                expect(context).to.have.property('timestamp').that.is.a('string'); // ISO 8601 format
            });
    
            // BDD-style validation: message validation
            it('should have a valid message with intent', () => {
                const { message } = jsonRequest;
                expect(message).to.have.property('intent');
               
            });
        });
    

// return srchObj;
}