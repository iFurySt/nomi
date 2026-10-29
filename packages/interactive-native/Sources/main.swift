import Foundation

func load(_ path: String) throws -> [String:Any] {
    let data = try Data(contentsOf: URL(fileURLWithPath:path))
    guard data.count<=262144 else { throw ReferenceError.invalid("budget") }
    return try object(JSONSerialization.jsonObject(with:data))
}
do {
    guard CommandLine.arguments.count==3 else { throw ReferenceError.invalid("usage: conformance program.json reference.json") }
    let program = try ReferenceProgram(load(CommandLine.arguments[1]))
    let reference = try load(CommandLine.arguments[2])
    var state = try program.hydrate()
    var snapshots = [try ReferenceEvaluation(program,state).snapshot()]
    for step in try array(required(reference,"eventTrace")) {
        let event = try object(required(object(step),"event"))
        if event["type"] as? String == "set" {
            state = try program.set(state,string(required(event,"state")),required(event,"value"))
        } else {
            let id = try string(required(event,"node"))
            guard let node = program.nodes.first(where: {$0["id"] as? String == id}) else { throw ReferenceError.invalid("node") }
            state = try program.action(state,string(required(object(required(node,"on")),"activate")))
        }
        snapshots.append(try ReferenceEvaluation(program,state).snapshot())
    }
    let probabilities = try array(required(reference,"probabilityCases")).map { c -> [Double] in
        let item = try object(c)
        return try softmax(array(required(item,"logits")).map {try numeric($0)},numeric(required(item,"temperature")))
    }
    let invalid = try array(required(reference,"invalidCases")).map { c -> Bool in
        let item = try object(c)
        do { _ = try softmax(array(required(item,"logits")).map {try numeric($0)},numeric(required(item,"temperature"))); return false }
        catch { return true }
    }
    let output: [String:Any] = ["snapshots":snapshots,"probabilities":probabilities,"invalid":invalid]
    let data = try JSONSerialization.data(withJSONObject:output,options:[.sortedKeys])
    FileHandle.standardOutput.write(data)
} catch {
    FileHandle.standardError.write(Data("Swift conformance failed: \(error)\n".utf8));exit(1)
}
