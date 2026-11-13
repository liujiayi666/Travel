export interface SseEvent {
  event: string;
  data: string;
}

const EVENT_BOUNDARY = /(?:\r\n|\n|\r(?!\n)){2}/;

// data example
// event: message
// : this is a comment
// data: hello
// data: world
function parseSseFrame(frame: string): SseEvent | null {
  let eventName = "message";
  const dataLines: string[] = [];

  for (const line of frame.split(/\r\n|\r|\n/)) {
    if (line.length === 0 || line.startsWith(":")) {
      continue;
    }
    //SSE 每一行的基本格式是：field: value 但规范也允许没有冒号-> data
    const colonIndex = line.indexOf(":");
    const field = colonIndex === -1 ? line : line.slice(0, colonIndex);
    let value = colonIndex === -1 ? line : line.slice(colonIndex + 1);

    //SSE 规定：冒号后面如果紧跟一个空格，只删除这一个空格
    if (value.startsWith(" ")) {
      value = value.slice(1);
    }

    if (field === "event") {
      eventName = value || "message";
    } else if (field === "data") {
      dataLines.push(value);
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  //  最后的返回值   {
  //   event: "message",
  //   data: "hello\nworld"
  // }
  return {
    event: eventName,
    data: dataLines.join("\n"),
  };
}

export async function* parseSseStream(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      //   const buffer = "data: hello\n\ndata: world\n\n";
      while (true) {
        const boundary = EVENT_BOUNDARY.exec(buffer);
        //  [
        //   "\n\n",  // boundary[0]：完整匹配到的内容
        //   index: 11,
        //   input: "data: hello\n\ndata: world\n\n",
        //   groups: undefined
        // ]
        if (boundary === null) break;
        const frame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        const event = parseSseFrame(frame);
        if (event !== null) {
          yield event;
        }
      }
    }
    buffer += decoder.decode();
    const finalEvent = parseSseFrame(buffer);
    if (finalEvent !== null) {
      yield finalEvent;
    }
  } finally {
    reader.releaseLock();
  }
}
