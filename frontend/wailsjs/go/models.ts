export namespace main {
	
	export class Competitor {
	    place: string;
	    id: string;
	    firstName: string;
	    lastName: string;
	    affiliation: string;
	    time: string;
	
	    static createFrom(source: any = {}) {
	        return new Competitor(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.place = source["place"];
	        this.id = source["id"];
	        this.firstName = source["firstName"];
	        this.lastName = source["lastName"];
	        this.affiliation = source["affiliation"];
	        this.time = source["time"];
	    }
	}
	export class LifData {
	    fileName: string;
	    eventName: string;
	    wind: string;
	    competitors: Competitor[];
	    modifiedTime: number;
	
	    static createFrom(source: any = {}) {
	        return new LifData(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.fileName = source["fileName"];
	        this.eventName = source["eventName"];
	        this.wind = source["wind"];
	        this.competitors = this.convertValues(source["competitors"], Competitor);
	        this.modifiedTime = source["modifiedTime"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

