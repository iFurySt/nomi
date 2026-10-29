import Foundation
import CoreFoundation

// Independent Foundation interpreter for trusted conformance fixtures, not an import boundary.
// The production Swift document validator / UI renderer are deliberately separate future work.
enum ReferenceError: Error { case invalid(String) }
func object(_ value: Any) throws -> [String: Any] {
    guard let result = value as? [String: Any] else { throw ReferenceError.invalid("object") }
    return result
}
func array(_ value: Any) throws -> [Any] {
    guard let result = value as? [Any], result.count <= 2048 else { throw ReferenceError.invalid("array") }
    return result
}
func numeric(_ value: Any) throws -> Double {
    guard let n = value as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID(), n.doubleValue.isFinite else { throw ReferenceError.invalid("number") }
    return n.doubleValue
}
func string(_ value: Any) throws -> String {
    guard let value = value as? String else { throw ReferenceError.invalid("string") }
    return value
}
func required(_ dict: [String:Any], _ key: String) throws -> Any {
    guard let value = dict[key] else { throw ReferenceError.invalid("missing \(key)") }
    return value
}
func softmax(_ logits: [Double], _ temperature: Double) throws -> [Double] {
    guard !logits.isEmpty, logits.count <= 64, temperature.isFinite, temperature > 0, logits.allSatisfy({$0.isFinite}), let max = logits.max() else { throw ReferenceError.invalid("domain") }
    let weights = logits.map { exp(($0 - max) / temperature) }
    let total = weights.reduce(0,+)
    return weights.map { $0 / total }
}
final class ReferenceProgram {
    let source: [String:Any]
    let definitions: [String:Any]
    let derived: [String:Any]
    let actions: [String:Any]
    let nodes: [[String:Any]]
    let budget: [String:Any]
    init(_ source: [String:Any]) throws {
        guard source["schema"] as? String == "nomi-interactive-ir/draft-1", source["profile"] as? String == "portable.learning/draft-1" else { throw ReferenceError.invalid("capability") }
        self.source = source
        definitions = try object(required(source,"state"))
        derived = try object(required(source,"derived"))
        actions = try object(required(source,"actions"))
        nodes = try array(required(source,"nodes")).map { try object($0) }
        budget = try object(required(source,"budget"))
        let req = try object(required(source,"requires"))
        guard try array(required(req,"hostEffects")).isEmpty else { throw ReferenceError.invalid("capability") }
        let components = Set(["Panel","Row","Text","Button","Slider","SegmentedControl","Math","Plot"])
        let functions = Set(["math.softmax","array.at","array.replaceAt"])
        for (k,v) in try object(required(req,"components")) { guard components.contains(k), try numeric(v)==1 else { throw ReferenceError.invalid("capability") } }
        for (k,v) in try object(required(req,"functions")) { guard functions.contains(k), try numeric(v)==1 else { throw ReferenceError.invalid("capability") } }
    }
    func valid(_ key: String, _ value: Any) -> Bool {
        guard let def = definitions[key] as? [String:Any], let type = def["type"] as? String else { return false }
        switch type {
        case "number":
            guard let n = try? numeric(value) else { return false }
            if let min = def["min"] as? Double, n < min { return false }
            if let max = def["max"] as? Double, n > max { return false }
            if let step = def["step"] as? Double {
                let units = (n - (def["min"] as? Double ?? 0)) / step
                if abs(units-units.rounded()) >= 1e-7 { return false }
            }
            return true
        case "enum": return (def["values"] as? [String] ?? []).contains(value as? String ?? "")
        case "vector":
            guard let values = value as? [Any], values.count == (def["length"] as? Int) else { return false }
            return values.allSatisfy { (try? numeric($0)) != nil }
        default: return false
        }
    }
    func hydrate(_ saved: [String:Any] = [:]) throws -> [String:Any] {
        try Dictionary(uniqueKeysWithValues: definitions.map { key,value in
            let def = try object(value)
            let fallback = try required(def,"default")
            return (key, saved[key].flatMap { valid(key,$0) ? $0 : nil } ?? fallback)
        })
    }
    func set(_ state: [String:Any], _ key: String, _ value: Any) throws -> [String:Any] {
        guard valid(key,value) else { throw ReferenceError.invalid("state") }
        var next = state; next[key] = value; return next
    }
    func action(_ state: [String:Any], _ id: String) throws -> [String:Any] {
        let action = try object(required(actions,id))
        guard action["kind"] as? String == "reset", action["scope"] as? String == "user" else { throw ReferenceError.invalid("capability") }
        var next = state
        for key in try array(required(action,"targets")) {
            let k = try string(key), def = try object(required(definitions,k))
            next[k] = try required(def,"default")
        }
        return next
    }
}
final class ReferenceEvaluation {
    let program: ReferenceProgram
    let state: [String:Any]
    var steps = 0
    var memo: [String:Any] = [:]
    var active: Set<String> = []
    init(_ program: ReferenceProgram, _ state: [String:Any]) { self.program=program;self.state=state }
    func derived(_ id: String) throws -> Any {
        if let value = memo[id] { return value }
        guard !active.contains(id) else { throw ReferenceError.invalid("cycle") }
        active.insert(id);defer { active.remove(id) }
        let value = try expression(required(program.derived,id))
        memo[id] = value;return value
    }
    func expression(_ raw: Any, _ vars: [String:Any] = [:]) throws -> Any {
        steps += 1
        guard steps <= min(100000,program.budget["maxStepsPerEvaluation"] as? Int ?? 0) else { throw ReferenceError.invalid("budget") }
        let e = try object(raw), kind = try string(required(e,"kind"))
        switch kind {
        case "literal": return try required(e,"value")
        case "state":
            let key = try string(required(e,"id")), value = try required(state,key)
            guard program.valid(key,value) else { throw ReferenceError.invalid("state") };return value
        case "variable": return try required(vars,string(required(e,"id")))
        case "derived": return try derived(string(required(e,"id")))
        case "object": return try object(required(e,"fields")).mapValues { try expression($0,vars) }
        case "match":
            let key = try string(expression(required(e,"value"),vars))
            return try expression(required(object(required(e,"cases")),key),vars)
        case "call":
            guard try numeric(required(e,"version"))==1 else { throw ReferenceError.invalid("capability") }
            let args = try array(required(e,"args")).map { try expression($0,vars) }, name = try string(required(e,"function"))
            guard args.count == (name == "array.replaceAt" ? 3 : 2) else { throw ReferenceError.invalid("arity") }
            if name == "math.softmax" { return try softmax(array(args[0]).map { try numeric($0) },numeric(args[1])) }
            var values = try array(args[0]);let index = try numeric(args[1])
            guard index.rounded()==index, index>=0, index<Double(values.count), values.count<=256 else { throw ReferenceError.invalid("index") }
            if name == "array.at" { return values[Int(index)] }
            if name == "array.replaceAt" { values[Int(index)]=args[2];return values }
            throw ReferenceError.invalid("capability")
        case "map":
            let values = try array(expression(required(e,"items"),vars)), variable = try string(required(e,"variable"))
            guard values.count<=256 else { throw ReferenceError.invalid("budget") }
            return try values.map { value -> Any in var next=vars;next[variable]=value;return try expression(required(e,"body"),next) }
        case "sampleFamily":
            let series = try array(required(e,"seriesValues")), count = try numeric(required(e,"count")), domain = try array(required(e,"domain")).map { try numeric($0) }
            guard count.rounded()==count, count>=2, count<=512, count <= (program.budget["maxSamplePointsPerSeries"] as? Double ?? 0), series.count <= (program.budget["maxSeries"] as? Int ?? 0), domain.count==2 else { throw ReferenceError.invalid("budget") }
            let iName = try string(required(e,"seriesVariable")), xName = try string(required(e,"sampleVariable"))
            return try series.map { i -> [String:Any] in
                let points = try (0..<Int(count)).map { j -> [String:Double] in
                    let x = domain[0]+(domain[1]-domain[0])*Double(j)/(count-1)
                    var next=vars;next[iName]=i;next[xName]=x
                    return ["x":x,"y":try numeric(expression(required(e,"value"),next))]
                }
                return ["series":i,"points":points]
            }
        default: throw ReferenceError.invalid("capability")
        }
    }
    func data(_ value: Any) throws -> Any {
        if let values = value as? [Any] { return try values.map { try data($0) } }
        if let values = value as? [String:Any] {
            if values["kind"] != nil { return try expression(values) }
            return try values.mapValues { try data($0) }
        }
        return value
    }
    func snapshot() throws -> [String:Any] {
        let values = try program.derived.keys.sorted().map { ($0,try derived($0)) }
        return ["state":state,"derived":Dictionary(uniqueKeysWithValues:values),"nodes":try program.nodes.map { node -> [String:Any] in
            ["id":try required(node,"id"),"props":try data(required(node,"props"))]
        }]
    }
}
